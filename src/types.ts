import type { ComponentType, ReactNode } from "react";

/** Page component type */
export type SuivantPage<P = Record<string, unknown>> = ComponentType<P>;

/** getStaticProps function signature */
export type GetStaticProps<P = Record<string, unknown>> = (context: {
  params: Record<string, string>;
}) => Promise<{ props: P }> | { props: P };

/** getStaticPaths function signature */
export type GetStaticPaths = () =>
  | Promise<{ paths: Array<{ params: Record<string, string> }> }>
  | { paths: Array<{ params: Record<string, string> }> };

/** useRouter return type */
export interface SuivantRouter {
  /** Route pattern, e.g. "/users/[id]" */
  pathname: string;
  /** Parsed params, e.g. { id: "123" } */
  query: Record<string, string>;
  /** Actual URL path, e.g. "/users/123" */
  asPath: string;
  /** Navigate to a URL */
  push: (url: string) => Promise<void>;
  /** Navigate without creating a history entry */
  replace: (url: string) => Promise<void>;
  /** Go back in history */
  back: () => void;
}

/** _app component props */
export interface AppProps {
  Component: ComponentType<any>;
  pageProps: Record<string, any>;
}

/** Route manifest entry */
export interface ManifestEntry {
  /** Route pattern, e.g. "/users/:id" */
  pattern: string;
  /** JS chunk path, e.g. "/_suivant/chunks/page-users-id-abc123.js" */
  chunk: string;
  /** Data JSON path, e.g. "/_suivant/data/users/123.json" */
  data: string;
  /** Dynamic param names, e.g. ["id"] */
  paramNames: string[];
}

/** Resolved route information used during build */
export interface ResolvedRoute {
  /** Absolute file path to the page module */
  filePath: string;
  /** Route pattern with brackets, e.g. "/users/[id]" */
  routePattern: string;
  /** URL-style pattern with colons, e.g. "/users/:id" */
  urlPattern: string;
  /** Dynamic parameter names */
  paramNames: string[];
}

/** Page module shape after compilation */
export interface PageModule {
  default: ComponentType<any>;
  getStaticProps?: GetStaticProps;
  getStaticPaths?: GetStaticPaths;
}

/** Route manifest (maps route patterns to entries) */
export type RouteManifest = Record<string, ManifestEntry>;

/** Head tag collected during SSR */
export interface HeadTag {
  type: string;
  props: Record<string, any>;
  key?: string;
}

/** _document template function params */
export interface DocumentParams {
  html: string;
  head: string;
  styles: string;
  scripts: string;
}
