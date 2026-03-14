/** Route matching utilities */

export interface MatchResult {
  pattern: string;
  params: Record<string, string>;
}

/**
 * Convert a URL pattern (e.g. "/users/:id") into a regex for matching.
 * Returns the regex and the ordered list of param names.
 */
export function patternToRegex(urlPattern: string): {
  regex: RegExp;
  paramNames: string[];
} {
  const paramNames: string[] = [];
  const regexStr = urlPattern
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        paramNames.push(segment.slice(1));
        return "([^/]+)";
      }
      return escapeRegex(segment);
    })
    .join("/");

  return {
    regex: new RegExp(`^${regexStr}$`),
    paramNames,
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match a URL path against a list of route patterns.
 * Returns the first match with extracted params, or null.
 */
export function matchRoute(
  urlPath: string,
  patterns: string[]
): MatchResult | null {
  // Normalize: remove trailing slash (except for root)
  const normalized = urlPath === "/" ? "/" : urlPath.replace(/\/$/, "");

  for (const pattern of patterns) {
    const { regex, paramNames } = patternToRegex(pattern);
    const match = normalized.match(regex);
    if (match) {
      const params: Record<string, string> = {};
      paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });
      return { pattern, params };
    }
  }

  return null;
}

/**
 * Convert a route pattern with brackets to a URL pattern with colons.
 * e.g. "/users/[id]" → "/users/:id"
 */
export function bracketToColonPattern(routePattern: string): string {
  return routePattern.replace(/\[(\w+)\]/g, ":$1");
}

/**
 * Fill in a route pattern with actual param values.
 * e.g. fillParams("/users/:id", { id: "123" }) → "/users/123"
 */
export function fillParams(
  urlPattern: string,
  params: Record<string, string>
): string {
  return urlPattern.replace(/:(\w+)/g, (_, name) => {
    if (!(name in params)) {
      throw new Error(`Missing param "${name}" for pattern "${urlPattern}"`);
    }
    return params[name];
  });
}

/**
 * Generate a slug-safe chunk name from a route pattern.
 * e.g. "/users/[id]" → "page-users-id"
 */
export function routeToChunkName(routePattern: string): string {
  if (routePattern === "/") return "page-index";
  return (
    "page-" +
    routePattern
      .slice(1) // remove leading /
      .replace(/\[(\w+)\]/g, "$1") // [id] → id
      .replace(/\//g, "-") // / → -
  );
}

/**
 * Generate the data JSON path for a specific route + params.
 * e.g. ("/users/[id]", { id: "123" }) → "users/123"
 */
export function routeToDataPath(
  routePattern: string,
  params: Record<string, string>
): string {
  if (routePattern === "/") return "index";
  const filled = routePattern
    .slice(1)
    .replace(/\[(\w+)\]/g, (_, name) => params[name] || name);
  return filled;
}
