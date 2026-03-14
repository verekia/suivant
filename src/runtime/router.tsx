import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
  type ComponentType,
} from "react";
import type { SuivantRouter, RouteManifest, AppProps } from "../types.js";
import { matchRoute } from "../build/routes.js";

interface RouterState {
  pathname: string;
  query: Record<string, string>;
  asPath: string;
  Component: ComponentType<any>;
  pageProps: Record<string, any>;
}

interface RouterContextValue extends SuivantRouter {
  Component: ComponentType<any>;
  pageProps: Record<string, any>;
}

const RouterContext = createContext<RouterContextValue | null>(null);

export function useRouter(): SuivantRouter {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error("useRouter must be used within a RouterProvider");
  }
  return {
    pathname: ctx.pathname,
    query: ctx.query,
    asPath: ctx.asPath,
    push: ctx.push,
    replace: ctx.replace,
    back: ctx.back,
  };
}

async function loadPage(
  url: string,
  manifest: RouteManifest
): Promise<{ Component: ComponentType<any>; pageProps: Record<string, any>; pathname: string; query: Record<string, string> } | null> {
  const patterns = Object.keys(manifest);
  const match = matchRoute(url, patterns);
  if (!match) return null;

  const entry = manifest[match.pattern];

  // Determine the data URL for this specific path
  const dataUrl = entry.data.replace(/:(\w+)/g, (_, name) => match.params[name] || name);

  // Fetch JS chunk and data JSON in parallel
  const [mod, dataRes] = await Promise.all([
    import(/* @vite-ignore */ entry.chunk),
    fetch(dataUrl).then((r) => r.json()).catch(() => ({})),
  ]);

  return {
    Component: mod.default,
    pageProps: dataRes.props ?? dataRes ?? {},
    pathname: match.pattern,
    query: match.params,
  };
}

interface RouterProviderProps {
  initialState: RouterState;
  manifest: RouteManifest;
  App: ComponentType<AppProps>;
  children?: ReactNode;
}

export function RouterProvider({
  initialState,
  manifest,
  App,
}: RouterProviderProps) {
  const [state, setState] = useState<RouterState>(initialState);

  const navigate = useCallback(
    async (url: string, replace = false) => {
      const result = await loadPage(url, manifest);
      if (!result) {
        // No match — fall back to normal navigation
        window.location.href = url;
        return;
      }

      setState({
        pathname: result.pathname,
        query: result.query,
        asPath: url,
        Component: result.Component,
        pageProps: result.pageProps,
      });

      if (replace) {
        window.history.replaceState({}, "", url);
      } else {
        window.history.pushState({}, "", url);
      }

      // Scroll to top
      window.scrollTo(0, 0);
    },
    [manifest]
  );

  const push = useCallback(
    (url: string) => navigate(url, false),
    [navigate]
  );

  const replace = useCallback(
    (url: string) => navigate(url, true),
    [navigate]
  );

  const back = useCallback(() => window.history.back(), []);

  // Handle popstate (browser back/forward)
  useEffect(() => {
    const handlePopState = async () => {
      const url = window.location.pathname;
      const result = await loadPage(url, manifest);
      if (result) {
        setState({
          pathname: result.pathname,
          query: result.query,
          asPath: url,
          Component: result.Component,
          pageProps: result.pageProps,
        });
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [manifest]);

  const contextValue: RouterContextValue = {
    pathname: state.pathname,
    query: state.query,
    asPath: state.asPath,
    push,
    replace,
    back,
    Component: state.Component,
    pageProps: state.pageProps,
  };

  return (
    <RouterContext.Provider value={contextValue}>
      <App Component={state.Component} pageProps={state.pageProps} />
    </RouterContext.Provider>
  );
}
