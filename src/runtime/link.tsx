import { type MouseEvent, type PointerEvent, type AnchorHTMLAttributes, useCallback } from "react";
import { useRouter, useManifest, prefetchPage } from "./router.js";

export interface LinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  replace?: boolean;
  /** Prefetch the page on hover. Defaults to true. */
  prefetch?: boolean;
}

function isModifiedEvent(event: MouseEvent): boolean {
  return !!(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);
}

function isExternalUrl(href: string): boolean {
  return /^https?:\/\//.test(href) || href.startsWith("//");
}

export default function Link({
  href,
  replace: shouldReplace = false,
  prefetch = true,
  children,
  onClick,
  onPointerEnter,
  target,
  ...rest
}: LinkProps) {
  const router = useRouter();
  const manifest = useManifest();

  const handleClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      // Call any user-provided onClick
      onClick?.(e);

      if (e.defaultPrevented) return;
      // Skip if modifier keys, external URL, or new tab target
      if (isModifiedEvent(e)) return;
      if (target && target !== "_self") return;
      if (isExternalUrl(href)) return;

      e.preventDefault();

      if (shouldReplace) {
        router.replace(href);
      } else {
        router.push(href);
      }
    },
    [href, shouldReplace, onClick, target, router]
  );

  const handlePointerEnter = useCallback(
    (e: PointerEvent<HTMLAnchorElement>) => {
      onPointerEnter?.(e);

      if (!prefetch || !manifest) return;
      if (isExternalUrl(href)) return;
      if (target && target !== "_self") return;

      prefetchPage(href, manifest);
    },
    [href, prefetch, manifest, onPointerEnter, target]
  );

  return (
    <a
      href={href}
      onClick={handleClick}
      onPointerEnter={handlePointerEnter}
      target={target}
      {...rest}
    >
      {children}
    </a>
  );
}
