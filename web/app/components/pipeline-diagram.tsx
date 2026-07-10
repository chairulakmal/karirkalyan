import { getTranslations } from "next-intl/server";
import { statusBadgeClass } from "@/app/lib/format";
import type { Status } from "@/app/lib/types";

/**
 * The homepage argues the app is built on a state machine. This draws one.
 *
 * **It is an illustration, not a mirror of the transition table.** It draws the
 * happy path and the three revival edges; the real table has 33 edges, and
 * `api/app/lib/application_fsm.rb` is its only source of truth. Copying the full
 * table into TypeScript is exactly what the Kanban board was deferred to v1.2.0
 * to avoid — nothing here is read by the app, and no behaviour depends on it, so
 * a stale arrow is a wrong drawing rather than a wrong transition. The caption
 * names the authoritative file for the same reason `llms.txt` does.
 *
 * The drawing is vertical — a rail of states in the register of a git log,
 * which is the audit trail's own aesthetic — because vertical never wraps: the
 * old horizontal row broke into ambiguous lines on a phone. The revival edges
 * are the point of the figure ("it is not a line"), so they are the one thing
 * drawn in the accent: a dashed cobalt trace from the closed states back up
 * into `applied`, with the figure's only arrowhead at the re-entry.
 *
 * Labels and colours come from the `status` catalog and `statusBadgeClass`, so
 * the vocabulary still has one home.
 */
const HAPPY_PATH = [
  "wishlist",
  "draft",
  "applied",
  "phone_screen",
  "technical",
  "final_round",
  "offer",
  "accepted",
] as const satisfies readonly Status[];

// Closed states that a real job hunt can walk back out of.
const REVIVABLE = ["rejected", "ghosted", "withdrawn"] as const satisfies readonly Status[];

// Where the revival edge re-enters the happy path.
const REVIVAL_TARGET = HAPPY_PATH.indexOf("applied");

// Every row shares these columns so the rails line up without a shared grid:
// [return trace] [spine + node] [chip].
const ROW = "grid h-11 grid-cols-[1.5rem_1.5rem_1fr] items-center";

// The revival trace: dashed (an exceptional path, not the normal flow) and
// cobalt (the figure's one accent — everything else is structural ink).
const EDGE = "border-dashed border-cobalt/60";

async function Chip({ status }: { status: Status }) {
  const t = await getTranslations("status");

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(status)}`}
    >
      {t(`label.${status}`)}
    </span>
  );
}

// The figure's single arrowhead, pointing right into the `applied` node.
function ArrowHead() {
  return (
    <span className="absolute right-1/2 top-1/2 mr-0.5 -translate-y-1/2">
      <svg viewBox="0 0 8 8" className="h-2 w-2 fill-cobalt">
        <path d="M0 0 L8 4 L0 8 Z" />
      </svg>
    </span>
  );
}

export async function PipelineDiagram() {
  const t = await getTranslations("home");
  const last = HAPPY_PATH.length - 1;

  return (
    <figure className="mt-16 border border-dune bg-linen p-6 md:p-8">
      <figcaption className="kk-label">{t("pipelineLabel")}</figcaption>

      <div className="mt-6 md:flex md:items-center md:gap-14">
        <div className="shrink-0">
          {/* An ordered list, because the order *is* the content. The rails are
              aria-hidden: a screen reader gets the sequence from the list. */}
          <ol>
            {HAPPY_PATH.map((status, i) => (
              <li key={status} className={ROW}>
                {/* Return-trace column: passes by every state below `applied`,
                    turns the corner at `applied` itself. */}
                <span aria-hidden="true" className="relative h-full">
                  {i === REVIVAL_TARGET && (
                    <>
                      <span className={`absolute bottom-0 left-1/2 top-1/2 w-0 border-l ${EDGE}`} />
                      <span className={`absolute left-1/2 right-0 top-1/2 h-0 border-t ${EDGE}`} />
                    </>
                  )}
                  {i > REVIVAL_TARGET && (
                    <span className={`absolute bottom-0 left-1/2 top-0 w-0 border-l ${EDGE}`} />
                  )}
                </span>

                {/* Spine column: hairline segments between filled nodes. */}
                <span aria-hidden="true" className="relative flex h-full items-center justify-center">
                  {i > 0 && <span className="absolute left-1/2 top-0 h-1/2 w-px bg-dune" />}
                  {i < last && <span className="absolute left-1/2 top-1/2 h-1/2 w-px bg-dune" />}
                  {i === REVIVAL_TARGET && (
                    <>
                      <span className={`absolute left-0 right-1/2 top-1/2 h-0 border-t ${EDGE}`} />
                      <ArrowHead />
                    </>
                  )}
                  <span className="relative h-2 w-2 bg-midnight" />
                </span>

                <span className="min-w-0">
                  <Chip status={status} />
                </span>
              </li>
            ))}
          </ol>

          {/* Gap between the path and the closed states — the return trace
              keeps running through it. */}
          <div aria-hidden="true" className="grid h-5 grid-cols-[1.5rem_1.5rem_1fr]">
            <span className="relative h-full">
              <span className={`absolute bottom-0 left-1/2 top-0 w-0 border-l ${EDGE}`} />
            </span>
          </div>

          {/* Unordered, because these are alternatives, not a sequence. Hollow
              nodes: closed states sit off the spine, each feeding the trace. */}
          <ul>
            {REVIVABLE.map((status, i) => (
              <li key={status} className={ROW}>
                <span aria-hidden="true" className="relative h-full">
                  <span
                    className={`absolute left-1/2 top-0 w-0 border-l ${EDGE} ${
                      i === REVIVABLE.length - 1 ? "bottom-1/2" : "bottom-0"
                    }`}
                  />
                  <span className={`absolute left-1/2 right-0 top-1/2 h-0 border-t ${EDGE}`} />
                </span>

                <span aria-hidden="true" className="relative flex h-full items-center justify-center">
                  <span className={`absolute left-0 right-1/2 top-1/2 h-0 border-t ${EDGE}`} />
                  <span className="relative h-2 w-2 border border-ink-soft/60 bg-linen" />
                </span>

                <span className="min-w-0">
                  <Chip status={status} />
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 max-w-md md:mt-0">
          <p className="text-sm leading-relaxed text-ink-soft">{t("pipelineNote")}</p>
          <p className="mt-5 font-mono text-[11px] leading-relaxed text-ink-soft/70">
            {t("pipelineSource")}
          </p>
        </div>
      </div>
    </figure>
  );
}
