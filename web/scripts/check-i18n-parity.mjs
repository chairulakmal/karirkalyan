#!/usr/bin/env node
// Fails when web/messages/en.json and ja.json disagree about which keys exist.
//
// next-intl resolves a missing key through t.has() to a fallback, so a `ja` key that never
// landed degrades silently — the page renders, lint and tsc and the build all pass, and a
// Japanese reader just gets English-shaped fallback copy nobody is alerted to. This is the
// alert. See SPEC.md § i18n → Catalog parity is checked in CI.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const MESSAGES = join(dirname(fileURLToPath(import.meta.url)), "..", "messages");
const LOCALES = ["en", "ja"];

// One walker for both catalogs — the convention matters less than that both sides are counted
// the same way. Array elements are leaves in their own right (`reasons.ghosted[0]`), not one
// opaque leaf per array: an FSM reason chip present in English and missing in Japanese is
// precisely the drift this exists to catch, and it is invisible if an array counts as one key.
function leaves(node, path = "", out = new Map()) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => leaves(v, `${path}[${i}]`, out));
  } else if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) leaves(v, path ? `${path}.${k}` : k, out);
  } else {
    out.set(path, typeof node);
  }
  return out;
}

const catalogs = Object.fromEntries(
  LOCALES.map((locale) => {
    const file = join(MESSAGES, `${locale}.json`);
    return [locale, leaves(JSON.parse(readFileSync(file, "utf8")))];
  }),
);

const problems = [];

for (const [locale, other] of [
  ["en", "ja"],
  ["ja", "en"],
]) {
  for (const key of catalogs[locale].keys()) {
    if (!catalogs[other].has(key)) problems.push(`${key} — in ${locale}.json, missing from ${other}.json`);
  }
}

// A key that is a string in one catalog and an object in the other is drift too: the catalogs
// disagree about the shape of the copy, and t() finds out at runtime.
for (const [key, type] of catalogs.en) {
  const jaType = catalogs.ja.get(key);
  if (jaType !== undefined && jaType !== type) {
    problems.push(`${key} — ${type} in en.json, ${jaType} in ja.json`);
  }
}

if (problems.length > 0) {
  console.error(`i18n catalog parity: ${problems.length} problem(s)\n`);
  for (const problem of problems.sort()) console.error(`  ${problem}`);
  console.error("\nBoth catalogs move together. See SPEC.md § i18n.");
  process.exit(1);
}

console.log(`i18n catalog parity: ${catalogs.en.size} keys, en and ja agree.`);
