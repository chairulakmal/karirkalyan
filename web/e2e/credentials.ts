/**
 * The seeded E2E account. Registration is closed (SPEC.md § Registration is closed),
 * so the suite can no longer make itself a throwaway user — it signs in as the account
 * `api/db/seeds.rb` creates, which reads these same two variables with these same two
 * defaults. Change one side and you must change the other.
 *
 * Deliberately not the demo account: that one holds twelve applications and would
 * swamp any assertion about the row a test just created.
 */
export const EMAIL = process.env.E2E_EMAIL ?? "e2e@karirkalyan.test";
export const PASSWORD = process.env.E2E_PASSWORD ?? "e2e-local-only";

/** Where the setup project parks the signed-in session for every other project to reuse. */
export const STORAGE_STATE = "e2e/.auth/state.json";
