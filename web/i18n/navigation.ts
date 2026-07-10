import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware replacements for `next/link` and `next/navigation`. Importing
 * these instead of the Next.js originals is what keeps a `/ja/*` visitor inside
 * `/ja/*` when they click through the app.
 */
const navigation = createNavigation(routing);

export const { Link, usePathname, useRouter, getPathname } = navigation;

/**
 * Re-exported with an explicit annotation rather than destructured alongside the
 * rest. TypeScript only lets a `never`-returning call end a code path when the
 * callee is a name with a *declared* type; a const destructured out of a call
 * expression has an inferred one, so `redirect()` would stop marking the code
 * after it unreachable and every server action that ends in one would fail to
 * typecheck with "function lacks ending return statement".
 */
export const redirect: typeof navigation.redirect = navigation.redirect;
