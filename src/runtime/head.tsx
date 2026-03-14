import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
  type ReactElement,
  Children,
  isValidElement,
} from "react";
import type { HeadTag } from "../types.js";

// SSR collection context
interface HeadContextValue {
  tags: HeadTag[];
}

const HeadContext = createContext<HeadContextValue | null>(null);

/** Provider for SSR head tag collection */
export function HeadProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: HeadContextValue;
}) {
  return <HeadContext.Provider value={value}>{children}</HeadContext.Provider>;
}

/** Collect head tag info from a ReactElement */
function elementToHeadTag(element: ReactElement): HeadTag {
  const { type, props, key } = element;
  return {
    type: type as string,
    props: { ...props },
    key: key ?? undefined,
  };
}

/** Get a dedup key for a head tag */
function getDedupeKey(tag: HeadTag): string {
  // Unique tags by type
  if (tag.type === "title") return "title";
  // Dedupe by key prop if provided
  if (tag.key) return `key:${tag.key}`;
  // Dedupe meta by name or property
  if (tag.type === "meta") {
    if (tag.props.name) return `meta:name:${tag.props.name}`;
    if (tag.props.property) return `meta:property:${tag.props.property}`;
    if (tag.props.charSet || tag.props.charset) return "meta:charset";
    if (tag.props.httpEquiv) return `meta:httpEquiv:${tag.props.httpEquiv}`;
  }
  // No dedup — will just append
  return `unique:${Math.random()}`;
}

/** Client-side: apply head tags to document.head */
function applyHeadTags(tags: HeadTag[]): (() => void) {
  const elements: Element[] = [];

  // Deduplicate — last one wins
  const deduped = new Map<string, HeadTag>();
  for (const tag of tags) {
    deduped.set(getDedupeKey(tag), tag);
  }

  for (const tag of deduped.values()) {
    if (tag.type === "title") {
      document.title = tag.props.children || "";
      continue;
    }

    const el = document.createElement(tag.type);
    for (const [key, value] of Object.entries(tag.props)) {
      if (key === "children") {
        el.textContent = value;
      } else if (key === "dangerouslySetInnerHTML") {
        el.innerHTML = value.__html;
      } else {
        el.setAttribute(key === "className" ? "class" : key, value);
      }
    }
    el.setAttribute("data-suivant-head", "");
    document.head.appendChild(el);
    elements.push(el);
  }

  return () => {
    for (const el of elements) {
      el.remove();
    }
  };
}

export default function Head({ children }: { children: ReactNode }) {
  const ssrContext = useContext(HeadContext);

  // Collect tags from children
  const tags: HeadTag[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child)) {
      tags.push(elementToHeadTag(child));
    }
  });

  // SSR mode: push tags to context
  if (ssrContext) {
    ssrContext.tags.push(...tags);
    return null;
  }

  // Client-side: manage head tags via effects
  useEffect(() => {
    return applyHeadTags(tags);
  });

  return null;
}

/** Render collected head tags to an HTML string (used during SSR) */
export function renderHeadTags(tags: HeadTag[]): string {
  // Deduplicate — last one wins
  const deduped = new Map<string, HeadTag>();
  for (const tag of tags) {
    deduped.set(getDedupeKey(tag), tag);
  }

  const parts: string[] = [];
  for (const tag of deduped.values()) {
    if (tag.type === "title") {
      parts.push(`<title>${escapeHtml(tag.props.children || "")}</title>`);
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
