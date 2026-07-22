#!/usr/bin/env node
// Fails when a TypeScript file outside the allow-list hardcodes a cluster of
// ApplicationFSM state names: a copy of the FSM's vocabulary that Ruby owns and
// that would drift silently the moment a state is added or renamed there. The
// README's "the board never mirrors the transition table" claim has been written
// three times and been wrong twice, each time because the grep behind it was
// never run to the end; this makes the build prove it rather than the prose.
//
// What counts as a copy: MIN_DISTINCT or more distinct state-name *string
// literals* ("applied", 'offer', ...) clustered within GAP lines of each other,
// i.e. an array or Set literal. Bare object keys typed `Record<Status, ...>` are
// deliberately NOT flagged: TypeScript already forces them complete and correct,
// so they cannot drift. The one place allowed to hold the names themselves is
// app/lib/types.ts's `Status` union, which is where this reads them from.
//
// Allow-list, justified line by line: a legitimate hardcoded set carries an
// inline `fsm-allow: <reason>` marker on, or within GAP lines above, its
// declaration. These are pure UI-affordance judgement (display order, which
// moves prompt) that no fetched fact could replace; see SPEC.md § Board view.
// The marker IS the justification, read in review, so the allow-list lives in
// the code it guards rather than drifting in a list over here.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(ROOT, "app");
const TYPES = join(APP, "lib", "types.ts");

const MIN_DISTINCT = 3; // fewer than this is a pair, not a copy of the set
const GAP = 3; // literals more than this many lines apart are not one cluster
const MARKER = "fsm-allow";

// The canonical state names, read from the one place allowed to hold them.
function canonicalStates() {
  const src = readFileSync(TYPES, "utf8");
  const union = src.match(/export type Status =([\s\S]*?);/);
  if (!union) {
    console.error("check-fsm-copies: could not find the `Status` union in types.ts");
    process.exit(1);
  }
  return new Set([...union[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
}

const STATES = canonicalStates();

// Every .ts/.tsx under app/, minus the unit tests and the Status source itself.
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const problems = [];

for (const file of walk(APP)) {
  if (file === TYPES) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  const markerLines = lines.flatMap((l, i) => (l.includes(MARKER) ? [i] : []));

  // State-name string literals only (single/double quotes, not backticks): the
  // repo writes state names in comments as `applied` in backticks, so ignoring
  // backticks keeps prose out of the scan without a comment parser.
  const hits = [];
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/["']([a-z_]+)["']/g)) {
      if (STATES.has(m[1])) hits.push({ state: m[1], line: i });
    }
  });

  // Cluster consecutive hits within GAP lines of each other; a cluster of
  // MIN_DISTINCT+ distinct states is a hardcoded set and needs a marker.
  let cluster = [];
  const flush = () => {
    if (cluster.length > 0) {
      const distinct = new Set(cluster.map((h) => h.state));
      const start = cluster[0].line;
      const end = cluster[cluster.length - 1].line;
      const allowed = markerLines.some((a) => a >= start - GAP && a <= end);
      if (distinct.size >= MIN_DISTINCT && !allowed) {
        problems.push(
          `${relative(ROOT, file)}:${start + 1}: a cluster of ${distinct.size} FSM states ` +
            `(${[...distinct].sort().join(", ")}) with no \`${MARKER}\` marker`,
        );
      }
    }
    cluster = [];
  };
  for (const h of hits) {
    if (cluster.length && h.line - cluster[cluster.length - 1].line > GAP) flush();
    cluster.push(h);
  }
  flush();
}

if (problems.length > 0) {
  console.error(`FSM copies: ${problems.length} unmarked hardcoded state set(s)\n`);
  for (const p of problems.sort()) console.error(`  ${p}`);
  console.error(
    `\nThe FSM lives in Ruby (ApplicationFSM). A set the board needs is fetched from /transitions;`,
  );
  console.error(
    `a genuine UI-affordance set carries an inline \`${MARKER}: <reason>\` marker. See SPEC.md § Board view.`,
  );
  process.exit(1);
}

console.log(`FSM copies: none. ${STATES.size} states known; ${MARKER} markers honoured.`);
