import path from "node:path";
import fs from "node:fs";
import pc from "picocolors";
import {
  findPagesDir,
  discoverPages,
  resolveSpecialFile,
} from "../build/discover.js";
import { compilePagesForSSR, bundleClientJS } from "../build/bundle.js";
import { renderPage, DefaultApp, defaultDocument } from "../build/render.js";
import { detectCssFile, buildCss } from "../build/css.js";
import {
  generateManifest,
  writeManifest,
  writeDataFiles,
} from "../build/manifest.js";
import { fillParams, routeToDataPath, routeToChunkName } from "../build/routes.js";
import type { ResolvedRoute, DocumentParams, AppProps } from "../types.js";
import type { ComponentType } from "react";

export async function build() {
  const projectRoot = process.cwd();
  const outDir = path.join(projectRoot, "out");

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

  // 2. Compile pages for SSR
  console.log(pc.gray("  Compiling pages for SSR..."));
  const ssrOutDir = await compilePagesForSSR(
    routes,
    { app: appFile ?? undefined, document: documentFile ?? undefined },
    projectRoot
  );

  // Helper to load a compiled SSR module
  function loadSSRModule(filePath: string): any {
    const relative = path.relative(projectRoot, filePath);
    const ssrPath = path.join(ssrOutDir, relative).replace(/\.(tsx?|jsx?)$/, ".cjs");
    // Clear require cache
    delete require.cache[require.resolve(ssrPath)];
    return require(ssrPath);
  }

  // Load _app
  let App: ComponentType<AppProps> = DefaultApp;
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

  // 3. Resolve all (route, params) pairs
  console.log(pc.gray("  Resolving static paths..."));

  type PageInstance = {
    route: ResolvedRoute;
    params: Record<string, string>;
    urlPath: string;
  };

  const pageInstances: PageInstance[] = [];

  for (const route of routes) {
    if (route.paramNames.length > 0) {
      // Dynamic route — call getStaticPaths
      const mod = loadSSRModule(route.filePath);
      if (!mod.getStaticPaths) {
        console.warn(
          pc.yellow(
            `  Warning: Dynamic route ${route.routePattern} has no getStaticPaths — skipping`
          )
        );
        continue;
      }
      const { paths } = await mod.getStaticPaths();
      for (const p of paths) {
        const urlPath = fillParams(route.urlPattern, p.params);
        pageInstances.push({ route, params: p.params, urlPath });
      }
    } else {
      pageInstances.push({ route, params: {}, urlPath: route.urlPattern });
    }
  }

  console.log(pc.gray(`  Will render ${pageInstances.length} page(s)`));

  // 4. Run getStaticProps for each page instance
  console.log(pc.gray("  Running getStaticProps..."));
  const propsMap = new Map<string, Record<string, any>>(); // dataKey → props

  for (const instance of pageInstances) {
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
  }

  // 5. Build CSS
  let cssPath: string | undefined;
  const cssFile = detectCssFile(appFile, pagesDir);
  if (cssFile) {
    console.log(pc.gray("  Building CSS..."));
    cssPath = await buildCss(cssFile, outDir, projectRoot);
  }

  // 6. Bundle client JS
  console.log(pc.gray("  Bundling client JavaScript..."));
  const chunkPaths = await bundleClientJS(
    routes,
    { app: appFile ?? undefined },
    projectRoot,
    outDir
  );

  // 7. Generate manifest
  const pageParams = new Map<string, Array<Record<string, string>>>();
  for (const instance of pageInstances) {
    const key = instance.route.routePattern;
    if (!pageParams.has(key)) pageParams.set(key, []);
    pageParams.get(key)!.push(instance.params);
  }

  const manifest = generateManifest(routes, chunkPaths, pageParams);

  // 8. SSR render each page
  console.log(pc.gray("  Rendering pages..."));

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

    const manifestJson = JSON.stringify(manifest);
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
    });

    // Determine output file path
    let outPath: string;
    if (instance.urlPath === "/") {
      outPath = path.join(outDir, "index.html");
    } else {
      outPath = path.join(outDir, instance.urlPath.slice(1) + ".html");
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html);
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
