import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import pc from "picocolors";
import {
  findPagesDir,
  discoverPages,
  resolveSpecialFile,
} from "../build/discover.js";
import { compilePagesForSSR, bundleClientJS } from "../build/bundle.js";
import { renderPage, assemblePageHtml, defaultDocument } from "../build/render.js";
import { detectCssFile, buildCss } from "../build/css.js";
import {
  generateManifest,
  writeManifest,
  writeDataFiles,
} from "../build/manifest.js";
import { fillParams, routeToDataPath, routeToChunkName } from "../build/routes.js";
import { loadEnvFiles, getPublicEnvDefines } from "../build/env.js";
import { pMap, getParallelism, SSRWorkerPool } from "../build/parallel.js";
import type { ResolvedRoute, DocumentParams, AppProps } from "../types.js";
import type { ComponentType } from "react";

/** SSR render helper source — compiled alongside pages so it shares the same externalized React */
const SSR_RENDER_HELPER = `
import { createElement } from "react";
import { renderToString } from "react-dom/server";

export function ssrRender(App, Page, pageProps) {
  // Use global head tag collection so it works across separately bundled CJS modules
  const headTags = [];
  globalThis.__suivant_head_tags = headTags;

  const appElement = createElement(App, { Component: Page, pageProps });
  const html = renderToString(appElement);

  delete globalThis.__suivant_head_tags;
  return { html, headTags };
}

export function defaultApp({ Component, pageProps }) {
  return createElement(Component, pageProps);
}
`;

export async function build() {
  const projectRoot = process.cwd();
  const outDir = path.join(projectRoot, "out");
  const concurrency = getParallelism();

  // Load environment files
  console.log(pc.gray("  Loading environment variables..."));
  const envVars = loadEnvFiles(projectRoot, "production");
  const publicEnvDefines = getPublicEnvDefines(envVars);

  // Clean output dir
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  // 1. Discover pages
  console.log(pc.gray("  Discovering pages..."));
  const pagesDir = findPagesDir(projectRoot);
  const routes = await discoverPages(pagesDir);
  console.log(pc.gray(`  Found ${routes.length} page(s)`));

  const appFile = resolveSpecialFile(pagesDir, "_app");
  const documentFile = resolveSpecialFile(pagesDir, "_document");

  // Write SSR render helper
  const ssrHelperDir = path.join(projectRoot, ".suivant", "helpers");
  fs.mkdirSync(ssrHelperDir, { recursive: true });
  const ssrHelperPath = path.join(ssrHelperDir, "ssr-render.tsx");
  fs.writeFileSync(ssrHelperPath, SSR_RENDER_HELPER);

  // 2. Compile pages for SSR
  console.log(pc.gray("  Compiling pages for SSR..."));
  const ssrOutDir = await compilePagesForSSR(
    routes,
    { app: appFile ?? undefined, document: documentFile ?? undefined },
    projectRoot,
    [ssrHelperPath]
  );

  // Helper to get the compiled SSR module path without loading it
  function ssrModulePath(filePath: string): string {
    const relative = path.relative(projectRoot, filePath);
    return path.join(ssrOutDir, relative).replace(/\.(tsx?|jsx?)$/, ".cjs");
  }

  // Helper to load a compiled SSR module
  // Anchor require to project root so externalized deps (react, etc.) resolve from the user's node_modules
  const projectRequire = createRequire(path.join(projectRoot, "package.json"));
  function loadSSRModule(filePath: string): any {
    const ssrPath = ssrModulePath(filePath);
    // Clear require cache
    delete projectRequire.cache[projectRequire.resolve(ssrPath)];
    return projectRequire(ssrPath);
  }

  // Load SSR render helper
  const ssrHelper = loadSSRModule(ssrHelperPath);

  // Load _app
  let App: ComponentType<AppProps> = ssrHelper.defaultApp;
  if (appFile) {
    const appMod = loadSSRModule(appFile);
    App = appMod.default || appMod;
  }

  // Load _document
  let documentFn: (params: DocumentParams) => string = defaultDocument;
  if (documentFile) {
    const docMod = loadSSRModule(documentFile);
    documentFn = docMod.default || docMod;
  }

  // 3. Resolve all (route, params) pairs — concurrently for dynamic routes
  console.log(pc.gray("  Resolving static paths..."));

  type PageInstance = {
    route: ResolvedRoute;
    params: Record<string, string>;
    urlPath: string;
  };

  const pageInstanceArrays = await pMap(
    routes,
    async (route) => {
      if (route.paramNames.length > 0) {
        const mod = loadSSRModule(route.filePath);
        if (!mod.getStaticPaths) {
          console.warn(
            pc.yellow(
              `  Warning: Dynamic route ${route.routePattern} has no getStaticPaths — skipping`
            )
          );
          return [];
        }
        const { paths } = await mod.getStaticPaths();
        return paths.map((p: { params: Record<string, string> }) => ({
          route,
          params: p.params,
          urlPath: fillParams(route.urlPattern, p.params),
        }));
      }
      return [{ route, params: {}, urlPath: route.urlPattern }];
    },
    concurrency
  );

  const pageInstances: PageInstance[] = pageInstanceArrays.flat();
  console.log(pc.gray(`  Will render ${pageInstances.length} page(s)`));

  // 4. Run getStaticProps concurrently
  console.log(pc.gray("  Running getStaticProps..."));
  const propsMap = new Map<string, Record<string, any>>(); // dataKey → props

  await pMap(
    pageInstances,
    async (instance) => {
      const mod = loadSSRModule(instance.route.filePath);
      let props = {};
      if (mod.getStaticProps) {
        const result = await mod.getStaticProps({ params: instance.params });
        props = result.props;
      }
      const dataKey = routeToDataPath(
        instance.route.routePattern,
        instance.params
      );
      propsMap.set(dataKey, props);
    },
    concurrency
  );

  // 5–6. Build CSS and bundle client JS in parallel
  console.log(pc.gray("  Building CSS & bundling client JavaScript..."));
  const cssFile = detectCssFile(appFile, pagesDir);

  const [cssPath, chunkPaths] = await Promise.all([
    cssFile
      ? buildCss(cssFile, outDir, projectRoot)
      : Promise.resolve(undefined),
    bundleClientJS(
      routes,
      { app: appFile ?? undefined },
      projectRoot,
      outDir,
      publicEnvDefines
    ),
  ]);

  // 7. Generate manifest
  const pageParams = new Map<string, Array<Record<string, string>>>();
  for (const instance of pageInstances) {
    const key = instance.route.routePattern;
    if (!pageParams.has(key)) pageParams.set(key, []);
    pageParams.get(key)!.push(instance.params);
  }

  const manifest = generateManifest(routes, chunkPaths, pageParams);
  const manifestJson = JSON.stringify(manifest);

  // 8. SSR render each page — use worker threads for large builds
  console.log(
    pc.gray(
      `  Rendering pages${SSRWorkerPool.shouldUseWorkers(pageInstances.length) ? ` (${concurrency} threads)` : ""}...`
    )
  );

  if (SSRWorkerPool.shouldUseWorkers(pageInstances.length)) {
    // Parallel SSR rendering with worker threads
    const poolSize = Math.min(concurrency, pageInstances.length);
    const pool = new SSRWorkerPool(projectRoot, poolSize);
    const ssrHelperCjsPath = ssrModulePath(ssrHelperPath);
    const appCjsPath = appFile ? ssrModulePath(appFile) : null;

    try {
      const renderResults = await Promise.all(
        pageInstances.map(async (instance) => {
          const pageModuleCjsPath = ssrModulePath(instance.route.filePath);
          const dataKey = routeToDataPath(
            instance.route.routePattern,
            instance.params
          );
          const pageProps = propsMap.get(dataKey) || {};

          const ssrResult = await pool.render({
            ssrHelperPath: ssrHelperCjsPath,
            pageModulePath: pageModuleCjsPath,
            appModulePath: appCjsPath,
            pageProps,
          });

          return { instance, ssrResult, pageProps };
        })
      );

      // Assemble final HTML and write files (fast, synchronous)
      for (const { instance, ssrResult, pageProps } of renderResults) {
        const chunkName = routeToChunkName(instance.route.routePattern);
        const chunkPath =
          chunkPaths.get(chunkName) || `/_suivant/chunks/${chunkName}.js`;
        const manifestScript = `<script id="__SUIVANT_MANIFEST__" type="application/json">${manifestJson}</script>`;
        const scriptTag = `<script type="module" src="${chunkPath}"></script>`;

        const html = assemblePageHtml({
          html: ssrResult.html,
          headTags: ssrResult.headTags,
          documentFn,
          cssPath,
          scriptTags: `${manifestScript}\n    ${scriptTag}`,
          dataJson: JSON.stringify(pageProps),
        });

        writePageHtml(outDir, instance.urlPath, html);
      }
    } finally {
      await pool.destroy();
    }
  } else {
    // Sequential SSR rendering for small builds (avoids worker thread overhead)
    for (const instance of pageInstances) {
      const mod = loadSSRModule(instance.route.filePath);
      const Page = mod.default || mod;
      const dataKey = routeToDataPath(
        instance.route.routePattern,
        instance.params
      );
      const pageProps = propsMap.get(dataKey) || {};

      const chunkName = routeToChunkName(instance.route.routePattern);
      const chunkPath =
        chunkPaths.get(chunkName) || `/_suivant/chunks/${chunkName}.js`;
      const manifestScript = `<script id="__SUIVANT_MANIFEST__" type="application/json">${manifestJson}</script>`;
      const scriptTag = `<script type="module" src="${chunkPath}"></script>`;

      const html = renderPage({
        Page,
        pageProps,
        App,
        documentFn,
        routePattern: instance.route.routePattern,
        params: instance.params,
        cssPath,
        scriptTags: `${manifestScript}\n    ${scriptTag}`,
        dataJson: JSON.stringify(pageProps),
        ssrRender: ssrHelper.ssrRender,
      });

      writePageHtml(outDir, instance.urlPath, html);
    }
  }

  // 9. Write manifest and data files
  writeManifest(manifest, outDir);
  writeDataFiles(routes, propsMap, outDir);

  // 10. Copy public/
  const publicDir = path.join(projectRoot, "public");
  if (fs.existsSync(publicDir)) {
    console.log(pc.gray("  Copying public/ assets..."));
    copyDir(publicDir, outDir);
  }

  // Clean up SSR temp files
  fs.rmSync(path.join(projectRoot, ".suivant"), { recursive: true, force: true });

  console.log(pc.green(`\n  Build complete! Output in ${pc.bold("out/")}\n`));
}

function writePageHtml(outDir: string, urlPath: string, html: string) {
  let outPath: string;
  if (urlPath === "/") {
    outPath = path.join(outDir, "index.html");
  } else {
    outPath = path.join(outDir, urlPath.slice(1) + ".html");
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
}

function copyDir(src: string, dest: string) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
