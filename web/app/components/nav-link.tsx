"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Header nav link that marks the page you're on (aria-current + underline).
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
