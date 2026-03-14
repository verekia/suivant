import { createServer, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import fs from "node:fs";
import pc from "picocolors";
import { findPagesDir, discoverPages, resolveSpecialFile } from "../build/discover.js";
import { matchRoute, bracketToColonPattern } from "../build/routes.js";
import type { ResolvedRoute, RouteManifest } from "../types.js";

const MANIFEST_VIRTUAL_ID = "virtual:suivant/manifest";
const RESOLVED_MANIFEST_ID = "\0" + MANIFEST_VIRTUAL_ID;

function suivantPlugin(projectRoot: string): Plugin {
  let pagesDir: string;
  let routes: ResolvedRoute[] = [];
  let server: ViteDevServer;

  async function refreshRoutes() {
    pagesDir = findPagesDir(projectRoot);
    routes = await discoverPages(pagesDir);
  }

  return {
    name: "suivant:router",

    async configResolved() {
      await refreshRoutes();
    },

    configureServer(srv) {
      server = srv;

      // Watch pages dir for file changes
      srv.watcher.on("add", async (filePath: string) => {
        if (filePath.startsWith(pagesDir)) {
          await refreshRoutes();
          // Invalidate virtual manifest module
          const mod = srv.moduleGraph.getModuleById(RESOLVED_MANIFEST_ID);
          if (mod) {
            srv.moduleGraph.invalidateModule(mod);
            srv.ws.send({ type: "full-reload" });
          }
        }
      });

      srv.watcher.on("unlink", async (filePath: string) => {
        if (filePath.startsWith(pagesDir)) {
          await refreshRoutes();
          const mod = srv.moduleGraph.getModuleById(RESOLVED_MANIFEST_ID);
          if (mod) {
            srv.moduleGraph.invalidateModule(mod);
            srv.ws.send({ type: "full-reload" });
          }
        }
      });

      // Handle data JSON requests — run getStaticProps on the fly
      srv.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/_suivant/data/")) return next();

        const dataPath = req.url
          .replace("/_suivant/data/", "")
          .replace(".json", "");

        // Find matching route
        const patterns = routes.map((r) => r.urlPattern);
        // Convert data path to URL path for matching
        const urlPath = "/" + dataPath;
        const match = matchRoute(urlPath, patterns);

        if (!match) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "Not found" }));
          return;
        }

        const route = routes.find((r) => r.urlPattern === match.pattern);
        if (!route) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "Not found" }));
          return;
        }

        try {
          const mod = await srv.ssrLoadModule(route.filePath);
          let props = {};
          if (mod.getStaticProps) {
            const result = await mod.getStaticProps({ params: match.params });
            props = result.props;
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ props }));
        } catch (err) {
          console.error(pc.red("Error running getStaticProps:"), err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Internal error" }));
        }
      });

      // SPA fallback: serve index.html for all routes
      srv.middlewares.use(async (req, res, next) => {
        if (
          req.method !== "GET" ||
          !req.url ||
          req.url.startsWith("/@") ||
          req.url.startsWith("/node_modules") ||
          req.url.includes(".")
        ) {
          return next();
        }

        const patterns = routes.map((r) => r.urlPattern);
        const match = matchRoute(req.url, patterns);

        if (!match) return next();

        const route = routes.find((r) => r.urlPattern === match.pattern);
        if (!route) return next();

        const appFile = resolveSpecialFile(pagesDir, "_app");

        // Generate dev HTML
        const html = generateDevHtml(route, appFile, projectRoot, pagesDir);
        const transformed = await srv.transformIndexHtml(req.url, html);
        res.setHeader("Content-Type", "text/html");
        res.statusCode = 200;
        res.end(transformed);
      });
    },

    resolveId(id) {
      if (id === MANIFEST_VIRTUAL_ID) return RESOLVED_MANIFEST_ID;
    },

    load(id) {
      if (id === RESOLVED_MANIFEST_ID) {
        // Build a dev manifest
        const manifest: RouteManifest = {};
        for (const route of routes) {
          manifest[route.urlPattern] = {
            pattern: route.urlPattern,
            chunk: route.filePath,
            data: `/_suivant/data${route.urlPattern === "/" ? "/index" : route.urlPattern}.json`,
            paramNames: route.paramNames,
          };
        }
        return `export default ${JSON.stringify(manifest)};`;
      }
    },
  };
}

function generateDevHtml(
  route: ResolvedRoute,
  appFile: string | null,
  projectRoot: string,
  pagesDir: string
): string {
  const pageImport = path.relative(projectRoot, route.filePath).replace(/\\/g, "/");
  const appImport = appFile
    ? path.relative(projectRoot, appFile).replace(/\\/g, "/")
    : null;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="__suivant"></div>
    <script type="module">
      import { createRoot } from "react-dom/client";
      import { createElement } from "react";
      import { RouterProvider } from "suivant/router";
      import manifest from "${MANIFEST_VIRTUAL_ID}";
      import Page from "/${pageImport}";
      ${appImport ? `import App from "/${appImport}";` : `const App = ({ Component, pageProps }) => createElement(Component, pageProps);`}

      // Fetch initial props
      const dataUrl = "/_suivant/data${route.urlPattern === "/" ? "/index" : route.urlPattern}.json"
        ${route.paramNames.length > 0 ? `.replace(/${route.paramNames.map((n) => `:${n}`).join("|")}/g, (m) => window.location.pathname.split("/").pop() || m)` : ""};

      const res = await fetch(dataUrl);
      const data = await res.json();

      const root = createRoot(document.getElementById("__suivant"));
      root.render(
        createElement(RouterProvider, {
          initialState: {
            pathname: "${route.routePattern}",
            query: {},
            asPath: window.location.pathname,
            Component: Page,
            pageProps: data.props || {},
          },
          manifest,
          App,
        })
      );
    </script>
  </body>
</html>`;
}

export async function startDevServer(options: { port: number }) {
  const projectRoot = process.cwd();

  const server = await createServer({
    root: projectRoot,
    server: {
      port: options.port,
    },
    plugins: [suivantPlugin(projectRoot), react(), tailwindcss()],
    resolve: {
      alias: {
        "suivant/link": path.resolve(projectRoot, "node_modules/suivant/dist/runtime/link.js"),
        "suivant/router": path.resolve(projectRoot, "node_modules/suivant/dist/runtime/router.js"),
        "suivant/head": path.resolve(projectRoot, "node_modules/suivant/dist/runtime/head.js"),
      },
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
    },
  });

  await server.listen();

  console.log(
    pc.green(`\n  Suivant dev server running at `) +
      pc.bold(`http://localhost:${options.port}\n`)
  );
}
