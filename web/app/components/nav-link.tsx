"use client";

import { Link, usePathname } from "@/i18n/navigation";

// Header nav link that marks the page you're on (aria-current + underline).
// Both imports come from `@/i18n/navigation`, not `next/*`: the Link keeps the
// visitor inside their locale, and this `usePathname` returns the path with the
// locale prefix already stripped, so `href` comparison needs no special case.
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "font-medium text-cobalt underline decoration-cobalt/40 underline-offset-8"
          : "font-medium text-ink-soft hover:text-cobalt"
      }
    >
      {children}
    </Link>
  );
}
