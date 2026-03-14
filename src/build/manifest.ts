import path from "node:path";
import fs from "node:fs";
import type { ResolvedRoute, RouteManifest, ManifestEntry } from "../types.js";
import { routeToChunkName, routeToDataPath } from "./routes.js";

/**
 * Generate the route manifest JSON.
 * Maps URL patterns to their JS chunk and data file paths.
 */
export function generateManifest(
  routes: ResolvedRoute[],
  chunkPaths: Map<string, string>,
  pageParams: Map<string, Array<Record<string, string>>>
): RouteManifest {
  const manifest: RouteManifest = {};

  for (const route of routes) {
    const chunkName = routeToChunkName(route.routePattern);
    const chunkPath =
      chunkPaths.get(chunkName) ||
      `/_suivant/chunks/${chunkName}.js`;

    // For dynamic routes, data path uses the pattern with colons
    // For static routes, just the route path
    const dataPath =
      route.paramNames.length > 0
        ? `/_suivant/data/${route.urlPattern.slice(1)}.json`
        : `/_suivant/data/${routeToDataPath(route.routePattern, {})}.json`;

    manifest[route.urlPattern] = {
      pattern: route.urlPattern,
      chunk: chunkPath,
      data: dataPath,
      paramNames: route.paramNames,
    };
  }

  return manifest;
}

/**
 * Write the route manifest to the output directory.
 */
export function writeManifest(
  manifest: RouteManifest,
  outDir: string
): void {
  const manifestDir = path.join(outDir, "_suivant");
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(
    path.join(manifestDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
}

/**
 * Write data JSON files for each page/params combination.
 */
export function writeDataFiles(
  routes: ResolvedRoute[],
  propsMap: Map<string, Record<string, any>>,
  outDir: string
): void {
  for (const [dataKey, props] of propsMap) {
    const dataFilePath = path.join(outDir, "_suivant", "data", `${dataKey}.json`);
    fs.mkdirSync(path.dirname(dataFilePath), { recursive: true });
    fs.writeFileSync(dataFilePath, JSON.stringify({ props }));
  }
}
