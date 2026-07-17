#!/usr/bin/env node
// Fails when web/messages/en.json and ja.json disagree about which keys exist.
//
// A `ja` key that never landed does not fall back to English — there is no English to fall
// back to. i18n/request.ts loads exactly one catalog, and configures no getMessageFallback
// and no fallback locale, so next-intl's default takes over: it renders the key path itself.
// A Japanese reader gets the literal string `dashboard.yourData` where a sentence belongs,
// and the only alarm is a console.error in a server log nobody reads. Meanwhile lint, tsc and
// the build are all green, because nothing about a missing key is a type error. That is the
// gap this closes: not a silent degradation, but a loudly broken page that CI called fine.
//
// What it cannot close: a key missing from *both* catalogs is perfectly symmetric, so this
// passes. See SPEC.md § i18n → Catalog parity is checked in CI.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const MESSAGES = join(dirname(fileURLToPath(import.meta.url)), "..", "messages");
const LOCALES = ["en", "ja"];

// One walker for both catalogs — the convention matters less than that both sides are counted
// the same way. Two rules earn their keep:
//
// Array elements are leaves in their own right (`reasons.ghosted[0]`), not one opaque leaf per
// array: an FSM reason chip present in English and missing in Japanese is precisely the drift
// this exists to catch, and it is invisible if an array counts as one key.
//
// Containers are recorded *as well as* descended into. Without that, a key that is a string in
// one catalog and an object in the other is invisible to the shape check below — `foo` would
// never be a key on the object side, only `foo.bar`, so the comparison would short-circuit on
// undefined and the drift would be reported as two unrelated missing paths. Recording the
// container also makes an empty `{}` visible, which a leaves-only walk drops entirely.
function paths(node, path = "", out = new Map()) {
  if (Array.isArray(node)) {
    if (path) out.set(path, "array");
    node.forEach((v, i) => paths(v, `${path}[${i}]`, out));
  } else if (node !== null && typeof node === "object") {
    if (path) out.set(path, "object");
    for (const [k, v] of Object.entries(node)) paths(v, path ? `${path}.${k}` : k, out);
  } else {
    out.set(path, typeof node);
  }
  return out;
}

const catalogs = Object.fromEntries(
  LOCALES.map((locale) => {
    const file = join(MESSAGES, `${locale}.json`);
    return [locale, paths(JSON.parse(readFileSync(file, "utf8")))];
  }),
);

const problems = [];

// Both directions, derived from LOCALES rather than spelled out, so a third locale is checked
// against every other the day it is added instead of half-checked.
for (const locale of LOCALES) {
  for (const other of LOCALES) {
    if (locale === other) continue;
    for (const key of catalogs[locale].keys()) {
      if (!catalogs[other].has(key)) {
        problems.push(`${key} — in ${locale}.json, missing from ${other}.json`);
      }
    }
  }
}

// A path that is a string in one catalog and an object in the other is drift too: the catalogs
// disagree about the shape of the copy, and t() finds out at runtime rather than here.
for (const [key, type] of catalogs[LOCALES[0]]) {
  for (const other of LOCALES.slice(1)) {
    const otherType = catalogs[other].get(key);
    if (otherType !== undefined && otherType !== type) {
      problems.push(`${key} — ${type} in ${LOCALES[0]}.json, ${otherType} in ${other}.json`);
    }
  }
}

if (problems.length > 0) {
  console.error(`i18n catalog parity: ${problems.length} problem(s)\n`);
  for (const problem of [...new Set(problems)].sort()) console.error(`  ${problem}`);
  console.error("\nBoth catalogs move together. See SPEC.md § i18n.");
  process.exit(1);
}

console.log(`i18n catalog parity: ${catalogs[LOCALES[0]].size} paths, ${LOCALES.join(" and ")} agree.`);
