// "Is this remote role survivable from JST?" The timezone-overlap arithmetic
// (SPEC.md § Data model). Pure functions of the company's IANA zone, the
// required daily overlap, and the current instant; nothing is stored, so DST is
// always the zone database's current answer rather than a value frozen at
// record time. Kept out of the components so it can carry a unit test once the
// web/ unit-test seam lands (TODO.md v1.10.0).

// The app's own zone. The API stores UTC and presents Tokyo (api config
// time_zone = "Tokyo"); this mirrors that anchor on the client side.
const TOKYO = "Asia/Tokyo";

// A company workday, in the company's own local clock. 9-to-18 is the anchor the
// survivability read assumes; the point is not to be exact about one company's
// hours but to place the band a Tokyo hire would have to reach into.
const WORKDAY_START = 9;
const WORKDAY_END = 18;

// JST hours before this are "antisocial": a start inside 00:00-07:00 is the 1am
// standup the whole feature exists to surface before you apply.
const LIVABLE_FROM = 7;

// A zone's offset from UTC, in minutes, at a given instant, DST included,
// because the instant selects the rule. The standard formatToParts round-trip:
// format `date` in the target zone, read it back as if those wall-clock numbers
// were UTC, and the gap is the offset.
function zoneOffsetMinutes(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

function mod24(h: number): number {
  return ((h % 24) + 24) % 24;
}

// The JST wall-clock parts of a UTC instant. The app is JST-centric (api config
// time_zone = "Tokyo"), so interview times are entered, shown, and reasoned
// about in Tokyo regardless of where the viewer sits.
function jstParts(iso: string): { date: string; time: string; hour: number } {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: TOKYO,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(iso))) {
    if (part.type !== "literal") p[part.type] = part.value;
  }
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    hour: Number(p.hour),
  };
}

// A UTC instant as the "YYYY-MM-DDTHH:MM" a datetime-local input wants, in JST.
export function toJstInputValue(iso: string): string {
  const { date, time } = jstParts(iso);
  return `${date}T${time}`;
}

// The interview's JST wall-clock, for display: "2026-07-25 03:00".
export function formatJstDateTime(iso: string): string {
  const { date, time } = jstParts(iso);
  return `${date} ${time}`;
}

// An interview whose JST hour falls before the livable band is the 3am call the
// timezone feature exists to flag: a company scheduling in its own zone can hand
// a Tokyo hire the middle of the night.
export function interviewIsAntisocial(iso: string): boolean {
  return jstParts(iso).hour < LIVABLE_FROM;
}

export type TimezoneOverlap = {
  // How far Tokyo is ahead of the company, in hours (negative = behind). The
  // headline number: "Tokyo is 16h ahead of US Pacific."
  offsetHoursFromTokyo: number;
  // The company's workday mapped into the JST clock (0-23, each may wrap past
  // midnight relative to the other). For display: "their 9-18 is 01:00-10:00 JST".
  jstWorkdayStart: number;
  jstWorkdayEnd: number;
  // Does the company's workday cross into the next JST day? (Drives a "+1"
  // day marker in the UI.)
  crossesMidnight: boolean;
  // Given overlap_hours_required, can that many of the company's workday hours
  // fall inside the livable JST band? Null overlap asks the weaker question:
  // is *any* of the workday livable at all?
  survivable: boolean;
};

// Returns null when there is no company zone to reason about. `overlapHours` is
// the role's required daily overlap (null when unrecorded). `now` is injected so
// the function stays pure and testable.
export function computeOverlap(
  companyTimezone: string | null,
  overlapHours: number | null,
  now: Date,
): TimezoneOverlap | null {
  if (!companyTimezone) return null;

  const offsetHoursFromTokyo =
    (zoneOffsetMinutes(TOKYO, now) - zoneOffsetMinutes(companyTimezone, now)) / 60;

  // Count the company's workday hours that land in the livable JST band. The
  // required overlap is survivable iff that many livable hours exist to hold it;
  // with no stated overlap, one livable hour is enough not to flag the role.
  let livableHours = 0;
  for (let h = WORKDAY_START; h < WORKDAY_END; h++) {
    if (mod24(h + offsetHoursFromTokyo) >= LIVABLE_FROM) livableHours += 1;
  }
  const needed = overlapHours && overlapHours > 0 ? Math.ceil(overlapHours) : 1;

  return {
    offsetHoursFromTokyo,
    jstWorkdayStart: mod24(WORKDAY_START + offsetHoursFromTokyo),
    jstWorkdayEnd: mod24(WORKDAY_END + offsetHoursFromTokyo),
    // The band spans JST midnight iff the wrapped end falls before the wrapped
    // start (e.g. Berlin summer 09-18 -> 16:00-01:00 JST). Drives the "+1 day"
    // cue on the end time, so "16:00-01:00 JST" is not read as a same-day window.
    crossesMidnight:
      mod24(WORKDAY_END + offsetHoursFromTokyo) < mod24(WORKDAY_START + offsetHoursFromTokyo),
    survivable: livableHours >= needed,
  };
}
