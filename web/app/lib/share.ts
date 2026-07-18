/* What a share-sheet navigation carried, reduced to the one thing the form can
   use. `share_target` (manifest.webmanifest) maps a share onto
   GET /applications/new?title=&text=&url=, but the mapping is advisory: most
   Android apps put the link in `text` with prose around it, some fill `url`,
   a few only `title`. So all three are scanned, in the order a link is
   likeliest to be the posting's, and the first http(s) URL found is the
   capture. A share with no URL anywhere is the "share selected text" flow —
   the payload *is* the posting — and comes back as text for the paste box.

   Only http(s) survives the parse. These params arrive from any link anyone
   crafts, not just from a share sheet, so a `javascript:` or `intent:` scheme
   must die here rather than be echoed into the form.
   SPEC.md § Installable app § Share target. */

export type SharedCapture =
  | { kind: "url"; url: string }
  | { kind: "text"; text: string };

type Param = string | string[] | undefined;

// Next.js hands back an array when a param repeats. A genuine share never
// repeats one, so anything past the first is junk to ignore, not data.
function first(param: Param): string {
  return (Array.isArray(param) ? param[0] : param) ?? "";
}

function urlIn(candidate: string): string | null {
  /* A character class of RFC 3986's URL alphabet, not \S+: Japanese prose has
     no spaces, so \S+ would run from the scheme to the end of the sentence —
     「詳細は https://…/pos（応募はお早めに）」 parses as a URL and auto-runs
     the pre-fill on garbage. Stopping at the first character a URL cannot
     contain ends the match at fullwidth punctuation and CJK for free; a share
     sheet hands over real links percent-encoded, so the ASCII-valid prefix is
     the link. */
  const match = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/i.exec(candidate);
  if (!match) return null;

  // Prose wraps links in punctuation ("see https://…, apply now") that the
  // class above still admits. Real URLs end in it rarely enough that stripping
  // is the better error, and the pre-fill's own fetch is the judge either way.
  const found = match[0].replace(/[),.;!?\]'"]+$/, "");
  try {
    const parsed = new URL(found);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? found : null;
  } catch {
    return null;
  }
}

export function capturedShare(params: {
  url?: Param;
  text?: Param;
  title?: Param;
}): SharedCapture | null {
  const sharedText = first(params.text);

  for (const candidate of [first(params.url), sharedText, first(params.title)]) {
    const url = urlIn(candidate);
    if (url) return { kind: "url", url };
  }

  const text = sharedText.trim();
  return text ? { kind: "text", text } : null;
}
