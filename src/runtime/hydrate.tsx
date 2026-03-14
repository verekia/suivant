import { hydrateRoot } from "react-dom/client";
import { RouterProvider } from "./router.js";
import type { RouteManifest, AppProps } from "../types.js";
import type { ComponentType } from "react";

/**
 * Client-side hydration entry.
 * Each page's client entry calls this to hydrate the SSR'd HTML.
 */
export function hydrate({
  Page,
  App,
  manifest,
}: {
  Page: ComponentType<any>;
  App: ComponentType<AppProps>;
  manifest: RouteManifest;
}) {
  // Read initial data from the embedded script tag
  const dataEl = document.getElementById("__SUIVANT_DATA__");
  const initialProps = dataEl ? JSON.parse(dataEl.textContent || "{}") : {};

  // Read route info
  const pathname = window.location.pathname;

  // Determine current route pattern from manifest
  let currentPattern = pathname;
  let query: Record<string, string> = {};

  for (const [pattern, entry] of Object.entries(manifest)) {
    const regex = patternToMatchRegex(pattern);
    const match = pathname.match(regex.re);
    if (match) {
      currentPattern = pattern;
      regex.paramNames.forEach((name, i) => {
        query[name] = match[i + 1];
      });
      break;
    }
  }

  const root = document.getElementById("__suivant");
  if (!root) {
    throw new Error('Missing #__suivant element. Check your _document.');
  }

  hydrateRoot(
    root,
    <RouterProvider
      initialState={{
        pathname: currentPattern,
        query,
        asPath: pathname,
        Component: Page,
        pageProps: initialProps,
      }}
      manifest={manifest}
      App={App}
    />
  );
}

function patternToMatchRegex(pattern: string): {
  re: RegExp;
  paramNames: string[];
} {
  const paramNames: string[] = [];
  const reStr = pattern
    .split("/")
    .map((seg) => {
      if (seg.startsWith(":")) {
        paramNames.push(seg.slice(1));
        return "([^/]+)";
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return { re: new RegExp(`^${reStr}$`), paramNames };
}
