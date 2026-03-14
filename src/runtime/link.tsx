import { type MouseEvent, type AnchorHTMLAttributes, useCallback } from "react";
import { useRouter } from "./router.js";

export interface LinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  replace?: boolean;
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
  children,
  onClick,
  target,
  ...rest
}: LinkProps) {
  const router = useRouter();

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

  return (
    <a href={href} onClick={handleClick} target={target} {...rest}>
      {children}
    </a>
  );
}
