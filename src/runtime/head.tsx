import {
  createContext,
  useContext,
  useEffect,
  useMemo,
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
    props: { ...(props as Record<string, any>) },
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

  const fragment = document.createDocumentFragment();

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
    fragment.appendChild(el);
    elements.push(el);
  }

  document.head.appendChild(fragment);

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

  // SSR mode: push tags to context (React context or global)
  if (ssrContext) {
    ssrContext.tags.push(...tags);
    return null;
  }
  const globalTags = (globalThis as any).__suivant_head_tags as HeadTag[] | undefined;
  if (globalTags) {
    globalTags.push(...tags);
    return null;
  }

  // Stable serialization so the effect only re-runs when tags actually change
  const tagKey = useMemo(() => JSON.stringify(tags), [tags]);

  // Client-side: manage head tags via effects
  useEffect(() => {
    return applyHeadTags(tags);
  }, [tagKey]);

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
