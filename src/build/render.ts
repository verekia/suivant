import type { DocumentParams, AppProps, HeadTag } from "../types.js";
import type { ComponentType } from "react";

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
  /** SSR render function from the compiled SSR helper */
  ssrRender: (App: ComponentType<AppProps>, Page: ComponentType<any>, pageProps: Record<string, any>) => { html: string; headTags: HeadTag[] };
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
    ssrRender,
  } = options;

  const { html, headTags } = ssrRender(App, Page, pageProps);
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

/** Render collected head tags to an HTML string */
function renderHeadTags(tags: HeadTag[]): string {
  const deduped = new Map<string, HeadTag>();
  for (const tag of tags) {
    deduped.set(getDedupeKey(tag), tag);
  }

  const parts: string[] = [];
  for (const tag of deduped.values()) {
    if (tag.type === "title") {
      const children = tag.props.children;
      const text = Array.isArray(children) ? children.join("") : String(children || "");
      parts.push(`<title>${escapeHtml(text)}</title>`);
      continue;
    }

    const attrs = Object.entries(tag.props)
      .filter(([key]) => key !== "children" && key !== "dangerouslySetInnerHTML")
      .map(([key, value]) => {
        const attrName = key === "className" ? "class" : key;
        return `${attrName}="${escapeHtml(String(value))}"`;
      })
      .join(" ");

    const selfClosing = ["meta", "link", "base"].includes(tag.type);

    if (selfClosing) {
      parts.push(`<${tag.type} ${attrs} />`);
    } else {
      const content =
        tag.props.dangerouslySetInnerHTML?.__html ??
        tag.props.children ??
        "";
      parts.push(`<${tag.type} ${attrs}>${content}</${tag.type}>`);
    }
  }

  return parts.join("\n    ");
}

function getDedupeKey(tag: HeadTag): string {
  if (tag.type === "title") return "title";
  if (tag.key) return `key:${tag.key}`;
  if (tag.type === "meta") {
    if (tag.props.name) return `meta:name:${tag.props.name}`;
    if (tag.props.property) return `meta:property:${tag.props.property}`;
    if (tag.props.charSet || tag.props.charset) return "meta:charset";
    if (tag.props.httpEquiv) return `meta:httpEquiv:${tag.props.httpEquiv}`;
  }
  return `unique:${Math.random()}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface AssemblePageHtmlOptions {
  html: string;
  headTags: HeadTag[];
  documentFn: (params: DocumentParams) => string;
  cssPath?: string;
  scriptTags: string;
  dataJson: string;
}

/**
 * Assemble the final page HTML from pre-rendered SSR output.
 * Used when SSR rendering is done in worker threads — the worker produces
 * html + headTags, and this function handles the rest (document template, CSS, scripts).
 */
export function assemblePageHtml(options: AssemblePageHtmlOptions): string {
  const { html, headTags, documentFn, cssPath, scriptTags, dataJson } = options;

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
  return json.replace(/<\//g, "<\\/").replace(/<!--/g, "<\\!--");
}
