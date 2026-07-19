import { Fragment, type ReactNode } from "react";
import { Parser, jaModel } from "budoux";

/* Server-only on purpose: importing this from a client component would ship
 * the model (and budoux's linkedom dependency) to the browser, which is what
 * running BudouX in RSC exists to avoid. SPEC.md § Japanese line breaking. */
const parser = new Parser(jaModel);

/* Hiragana, katakana, kanji: the scripts the Japanese model segments. Script
 * properties, not codepoint ranges: Katakana includes the half-width block and
 * Han covers the astral-plane extensions, both of which hand-copied BMP ranges
 * silently miss. Latin-only strings (every `en` catalog string) fail this test
 * and pass through untouched, so call sites need no locale check. */
const JAPANESE = /[\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Han}]/u;

function annotate(text: string) {
  const phrases = parser.parse(text);
  return phrases.map((phrase, i) => (
    <Fragment key={i}>
      {i > 0 && <wbr />}
      {phrase}
    </Fragment>
  ));
}

/* Re-emits Japanese string children as phrase segments separated by <wbr>,
 * inside a span whose `keep-all` makes those the only break points;
 * `overflow-wrap` is the escape valve for a phrase wider than its container.
 * Element children are not recursed into: a t.rich call site that wants its
 * chunks segmented wraps them inside the tag renderer. */
export function Phrase({ children }: { children: ReactNode }): ReactNode {
  const nodes = Array.isArray(children) ? children : [children];
  if (!nodes.some((node) => typeof node === "string" && JAPANESE.test(node))) {
    return children;
  }
  return (
    <span className="break-keep [overflow-wrap:anywhere]">
      {nodes.map((node, i) =>
        typeof node === "string" && JAPANESE.test(node) ? (
          <Fragment key={i}>{annotate(node)}</Fragment>
        ) : (
          <Fragment key={i}>{node}</Fragment>
        ),
      )}
    </span>
  );
}
