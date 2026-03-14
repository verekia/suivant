import * as esbuild from "esbuild";
import path from "node:path";
import fs from "node:fs";
import type { ResolvedRoute } from "../types.js";
import { routeToChunkName } from "./routes.js";

/**
 * Compile page modules for SSR (Node.js, CJS format).
 * Returns the output directory containing the compiled modules.
 */
export async function compilePagesForSSR(
  pages: ResolvedRoute[],
  specialFiles: { app?: string; document?: string },
  projectRoot: string,
  extraEntryPoints: string[] = []
): Promise<string> {
  const outdir = path.join(projectRoot, ".suivant", "ssr");

  const entryPoints: string[] = [
    ...pages.map((p) => p.filePath),
    ...extraEntryPoints,
  ];
  if (specialFiles.app) entryPoints.push(specialFiles.app);
  if (specialFiles.document) entryPoints.push(specialFiles.document);

  await esbuild.build({
    entryPoints,
    outdir,
    format: "cjs",
    platform: "node",
    target: "node18",
    bundle: true,
    jsx: "automatic",
    splitting: false,
    outExtension: { ".js": ".cjs" },
    external: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    logLevel: "warning",
    // Preserve directory structure by using entry names
    outbase: projectRoot,
  });

  return outdir;
}

/**
 * Bundle client-side JS for production.
 * Creates per-page entry points that hydrate the app.
 */
export async function bundleClientJS(
  pages: ResolvedRoute[],
  specialFiles: { app?: string },
  projectRoot: string,
  outDir: string,
  envDefines: Record<string, string> = {}
): Promise<Map<string, string>> {
  const chunksDir = path.join(outDir, "_suivant", "chunks");
  fs.mkdirSync(chunksDir, { recursive: true });

  // Create temporary entry files for each page
  const tmpDir = path.join(projectRoot, ".suivant", "client-entries");
  fs.mkdirSync(tmpDir, { recursive: true });

  const entryMap = new Map<string, string>(); // chunkName → entry file path
  const chunkNameToRoute = new Map<string, ResolvedRoute>();

  for (const route of pages) {
    const chunkName = routeToChunkName(route.routePattern);
    const entryFile = path.join(tmpDir, `${chunkName}.tsx`);
    chunkNameToRoute.set(chunkName, route);

    const pageImport = route.filePath;
    const appImport = specialFiles.app || null;

    const entryCode = `
import { hydrate } from "${path.resolve(projectRoot, "node_modules", "suivant", "dist", "runtime", "hydrate.js").replace(/\\/g, "/")}";
import Page from "${pageImport.replace(/\\/g, "/")}";
${appImport ? `import App from "${appImport.replace(/\\/g, "/")}";` : `const App = ({ Component, pageProps }) => <Component {...pageProps} />;`}

export default Page;

// Only hydrate on initial page load, not when imported during client-side navigation
if (!window.__suivant_hydrated) {
  window.__suivant_hydrated = true;
  const manifest = JSON.parse(document.getElementById("__SUIVANT_MANIFEST__")?.textContent || "{}");
  hydrate({ Page, App, manifest });
}
`;
    fs.writeFileSync(entryFile, entryCode);
    entryMap.set(chunkName, entryFile);
  }

  // Bundle all entries with code splitting
  const result = await esbuild.build({
    entryPoints: Object.fromEntries(entryMap),
    outdir: chunksDir,
    format: "esm",
    platform: "browser",
    target: "es2020",
    bundle: true,
    splitting: true,
    jsx: "automatic",
    minify: true,
    treeShaking: true,
    metafile: true,
    external: [],
    define: {
      "process.env.NODE_ENV": '"production"',
      ...envDefines,
    },
    logLevel: "warning",
  });

  // Map chunk names to their output file paths (with hashes from metafile)
  const chunkPaths = new Map<string, string>();
  if (result.metafile) {
    for (const [outputFile] of Object.entries(result.metafile.outputs)) {
      if (!outputFile.endsWith(".js")) continue;
      const basename = path.basename(outputFile, ".js");
      // Match chunk names from entry map
      for (const [chunkName] of entryMap) {
        if (basename.startsWith(chunkName)) {
          chunkPaths.set(
            chunkName,
            "/_suivant/chunks/" + path.basename(outputFile)
          );
        }
      }
    }
  }

  // Clean up temp entries
  fs.rmSync(tmpDir, { recursive: true, force: true });

  return chunkPaths;
}
