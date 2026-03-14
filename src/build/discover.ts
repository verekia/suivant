import { glob } from "glob";
import path from "node:path";
import fs from "node:fs";
import type { ResolvedRoute } from "../types.js";

/** Find the pages directory — prefers src/pages/ over pages/ */
export function findPagesDir(projectRoot: string): string {
  const srcPages = path.join(projectRoot, "src", "pages");
  if (fs.existsSync(srcPages)) return srcPages;
  const pages = path.join(projectRoot, "pages");
  if (fs.existsSync(pages)) return pages;
  throw new Error(
    "No pages directory found. Create pages/ or src/pages/ in your project root."
  );
}

/** Check if a filename is a special file (_app, _document) */
function isSpecialFile(name: string): boolean {
  return name === "_app" || name === "_document";
}

/** Check if a file should be ignored */
function shouldIgnore(relativePath: string): boolean {
  const parts = relativePath.split(path.sep);
  for (const part of parts) {
    const name = part.replace(/\.\w+$/, "");
    // Ignore dotfiles
    if (part.startsWith(".")) return true;
    // Ignore underscore-prefixed files except _app and _document
    if (part.startsWith("_") && !isSpecialFile(name)) return true;
  }
  return false;
}

/** Convert a file path relative to pages dir into a route pattern */
export function fileToRoute(relativePath: string): ResolvedRoute {
  // Remove extension
  const withoutExt = relativePath.replace(/\.(tsx?|jsx?)$/, "");
  // Split into segments
  const segments = withoutExt.split(path.sep);

  // Remove trailing "index"
  if (segments[segments.length - 1] === "index") {
    segments.pop();
  }

  const paramNames: string[] = [];
  const routeSegments: string[] = [];
  const urlSegments: string[] = [];

  for (const segment of segments) {
    const dynamicMatch = segment.match(/^\[(\w+)\]$/);
    if (dynamicMatch) {
      paramNames.push(dynamicMatch[1]);
      routeSegments.push(segment); // Keep [id] format
      urlSegments.push(`:${dynamicMatch[1]}`); // Convert to :id format
    } else {
      routeSegments.push(segment);
      urlSegments.push(segment);
    }
  }

  const routePattern = "/" + routeSegments.join("/");
  const urlPattern = "/" + urlSegments.join("/");

  return {
    filePath: "", // Will be set by caller
    routePattern: routePattern === "/" ? "/" : routePattern,
    urlPattern: urlPattern === "/" ? "/" : urlPattern,
    paramNames,
  };
}

/** Discover all page files and resolve their routes */
export async function discoverPages(
  pagesDir: string
): Promise<ResolvedRoute[]> {
  const files = await glob("**/*.{tsx,ts,jsx,js}", {
    cwd: pagesDir,
    posix: true,
  });

  const routes: ResolvedRoute[] = [];

  for (const file of files) {
    if (shouldIgnore(file)) continue;

    // Skip special files
    const name = path.basename(file).replace(/\.\w+$/, "");
    if (isSpecialFile(name)) continue;

    const route = fileToRoute(file);
    route.filePath = path.join(pagesDir, file);
    routes.push(route);
  }

  // Sort: static routes first, then dynamic
  routes.sort((a, b) => {
    const aDynamic = a.paramNames.length > 0;
    const bDynamic = b.paramNames.length > 0;
    if (aDynamic !== bDynamic) return aDynamic ? 1 : -1;
    return a.routePattern.localeCompare(b.routePattern);
  });

  return routes;
}

/** Resolve the path to _app or _document if it exists */
export function resolveSpecialFile(
  pagesDir: string,
  name: "_app" | "_document"
): string | null {
  const extensions = [".tsx", ".ts", ".jsx", ".js"];
  for (const ext of extensions) {
    const filePath = path.join(pagesDir, name + ext);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}
