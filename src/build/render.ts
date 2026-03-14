import { createElement } from "react";
import { renderToString } from "react-dom/server";
import type { DocumentParams, AppProps, HeadTag } from "../types.js";
import { HeadProvider, renderHeadTags } from "../runtime/head.js";
import type { ComponentType } from "react";

/** Default _app: just renders the page component */
export function DefaultApp({ Component, pageProps }: AppProps) {
  return createElement(Component, pageProps);
}

/** Default _document template */
export function defaultDocument({
  html,
  head,
  styles,
  scripts,
}: DocumentParams): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${head}
    ${styles}
  </head>
  <body>
    <div id="__suivant">${html}</div>
    ${scripts}
  </body>
</html>`;
}

export interface RenderPageOptions {
  Page: ComponentType<any>;
  pageProps: Record<string, any>;
  App: ComponentType<AppProps>;
  documentFn: (params: DocumentParams) => string;
  routePattern: string;
  params: Record<string, string>;
  cssPath?: string;
  scriptTags: string;
  dataJson: string;
}

/** Render a page to a full HTML string */
export function renderPage(options: RenderPageOptions): string {
  const {
    Page,
    pageProps,
    App,
    documentFn,
    cssPath,
    scriptTags,
    dataJson,
  } = options;

  // Collect head tags during SSR
  const headTags: HeadTag[] = [];
  const headContext = { tags: headTags };

  const appElement = createElement(App, {
    Component: Page,
    pageProps,
  });

  const wrappedElement = createElement(
    HeadProvider,
    { value: headContext },
    appElement
  );

  const html = renderToString(wrappedElement);
  const headHtml = renderHeadTags(headTags);

  const styles = cssPath
    ? `<link rel="stylesheet" href="${cssPath}" />`
    : "";

  const dataScript = `<script id="__SUIVANT_DATA__" type="application/json">${escapeJsonForScript(dataJson)}</script>`;

  return documentFn({
    html,
    head: headHtml,
    styles,
    scripts: `${dataScript}\n    ${scriptTags}`,
  });
}

function escapeJsonForScript(json: string): string {
  // Escape </script> and <!-- within JSON embedded in HTML
  return json.replace(/<\//g, "<\\/").replace(/<!--/g, "<\\!--");
}
