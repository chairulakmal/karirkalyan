// A short one-line preview of a longer text, for the board's triage cards: the
// notes field is full text on the index payload, and the card wants a glance of
// it, not the whole thing. Codepoint-aware (`[...text]`), because this app is
// full of Japanese and `.length`/`.slice` count UTF-16 units, so an emoji or a
// surrogate-pair kanji would be cut mid-character. Newlines collapse to spaces
// so the preview stays one line.
export function excerpt(text: string | null | undefined, maxLength = 80): string {
  if (!text) return "";
  const collapsed = text.replace(/\s+/g, " ").trim();
  const chars = [...collapsed];
  if (chars.length <= maxLength) return collapsed;
  return `${chars.slice(0, maxLength).join("").trimEnd()}…`;
}
