export const REPO_URL = "https://github.com/chairulakmal/karirkalyan";

// The API's *public* origin — where a browser reaches Rails directly. Its only
// job is building outbound doc links, so it stays module-private: nothing in
// `web/` should fetch through it. Server-side requests go through
// INTERNAL_API_URL (app/lib/api.ts), which in production is the private
// api.railway.internal address and carries the JWT.
const PUBLIC_API_ORIGIN = "https://api-production-4899.up.railway.app";
export const API_DOCS_URL = `${PUBLIC_API_ORIGIN}/api-docs`;

// Where a data or erasure request lands. The legal pages name it, so it has to be
// a mailbox that is actually read — see SPEC.md § Legal pages.
export const CONTACT_EMAIL = "karirkalyan@cypherpunkzero.com";
