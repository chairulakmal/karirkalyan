"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { getPathname, redirect } from "@/i18n/navigation";
import { apiFetch } from "./api";
import type { ApiFailure } from "./api";
import type { Application } from "./types";

// next-intl's redirect/getPathname take the locale explicitly — a server action
// has no component tree to infer it from. Both are unprefixed for `en` and
// prefixed for `ja`, so a Japanese visitor lands back inside `/ja/*` instead of
// being dumped on the English page.

// A failed action; `status`/`code` are the upstream HTTP status and error code
// when the failure came from the API (absent for local validation failures).
// Callers key off them to recover from a 409/`stale_record` optimistic-lock
// conflict.
export type ActionFailure = { ok: false; error: string; status?: number; code?: string };
export type ActionResult = { ok: true } | ActionFailure;

// Statuses with a fallback catalog entry of their own (the v1.1.0 map);
// anything else falls back to `errors.unknown`.
const TRANSLATED_STATUSES = new Set([401, 403, 404, 409, 422, 429, 502, 503]);

// Localizes an upstream failure off the API's machine-readable `code`
// (per-field `details` first, then the code, then the status map, then
// `errors.unknown`). Never string-match the English `error` sentence — the
// codes exist so no one has to parse prose. Resolution order in SPEC.md
// § Server-side error messages.
async function apiFailure(res: ApiFailure): Promise<ActionFailure> {
  const t = await getTranslations("errors");
  const failure = { ok: false as const, status: res.status, code: res.code };

  if (res.code === "validation_failed" && res.details) {
    const messages = res.details
      .map((d) => `field.${d.field}_${d.code}`)
      .filter((key) => t.has(key))
      .map((key) => t(key));
    if (messages.length > 0) return { ...failure, error: messages.join(" ") };
  }

  if (res.code && t.has(`code.${res.code}`)) {
    return { ...failure, error: t(`code.${res.code}`) };
  }

  const key = TRANSLATED_STATUSES.has(res.status) ? String(res.status) : "unknown";
  return { ...failure, error: t(key) };
}

// Local (pre-request) validation failure — no HTTP status to key on, so the
// caller names the catalog entry directly.
async function localFailure(key: string): Promise<ActionFailure> {
  const t = await getTranslations("errors");
  return { ok: false, error: t(key) };
}

// Revalidates the pages a write can change. Only the caller's locale is
// revalidated: every route is dynamically rendered (see the root layout), so
// there is no shared Full Route Cache to purge — just the visitor's own router
// cache, which only ever holds paths in the locale they are browsing.
async function revalidateApplication(id: number) {
  const locale = await getLocale();
  revalidatePath(getPathname({ href: `/applications/${id}`, locale }));
  revalidatePath(getPathname({ href: "/dashboard", locale }));
  revalidatePath(getPathname({ href: "/board", locale }));
}

// Resolves only on failure — the success path ends in redirect(), which throws
// and never returns. Typing it as ActionFailure keeps call sites honest.
export async function createApplication(formData: FormData): Promise<ActionFailure> {
  const company = formData.get("company")?.toString().trim();
  const role = formData.get("role")?.toString().trim();
  if (!company || !role) {
    return localFailure("companyRoleRequired");
  }

  const body = new FormData();
  body.append("application[company]", company);
  body.append("application[role]", role);

  const url = formData.get("url")?.toString().trim();
  if (url) body.append("application[url]", url);

  const notes = formData.get("notes")?.toString().trim();
  if (notes) body.append("application[notes]", notes);

  const followUpAt = formData.get("follow_up_at")?.toString().trim();
  if (followUpAt) body.append("application[follow_up_at]", followUpAt);

  const status = formData.get("status")?.toString().trim();
  if (status) body.append("application[status]", status);

  // Only meaningful when starting in "applied" — backdates applied_at so the
  // dashboard timing stays accurate for jobs added after the fact.
  const appliedAt = formData.get("applied_at")?.toString().trim();
  if (status === "applied" && appliedAt) {
    body.append("application[applied_at]", appliedAt);
  }

  const resume = formData.get("resume");
  if (resume instanceof File && resume.size > 0) {
    body.append("application[resume]", resume);
  }

  const coverLetter = formData.get("cover_letter");
  if (coverLetter instanceof File && coverLetter.size > 0) {
    body.append("application[cover_letter]", coverLetter);
  }

  const res = await apiFetch<Application>("/applications", {
    method: "POST",
    body,
  });

  if (!res.ok) return apiFailure(res);

  const locale = await getLocale();
  revalidatePath(getPathname({ href: "/dashboard", locale }));
  redirect({ href: `/applications/${res.data.id}`, locale });
}

type PrefillFields = { company: string; role: string; notes: string; url: string };

// The failure arm is ActionFailure, not a bare { ok, error }: apiFailure has
// always returned `code` and `status`, and narrowing them away here threw the
// signal out at the door. The form branches on `code` to decide whether a failure
// has a recovery worth offering — `prefill_blocked` and `prefill_failed` get the
// paste box, `prefill_unreachable` gets a retry — which is exactly what the error
// taxonomy was typed for. Never string-match `error`; that is what `code` is for.
export type PrefillResult = ({ ok: true } & PrefillFields) | ActionFailure;

export async function prefillFromUrl(url: string): Promise<PrefillResult> {
  const trimmed = url.trim();
  if (!trimmed) return localFailure("urlRequired");

  const res = await apiFetch<PrefillFields>("/applications/prefill", {
    method: "POST",
    body: JSON.stringify({ url: trimmed }),
  });

  if (!res.ok) return apiFailure(res);
  return { ok: true, ...res.data };
}

// The fallback for a posting the fetcher cannot read. `url` rides along unfetched
// so a posting pasted after a block still records where it came from.
export async function prefillFromText(text: string, url: string): Promise<PrefillResult> {
  const trimmed = text.trim();
  if (!trimmed) return localFailure("pasteRequired");

  const res = await apiFetch<PrefillFields>("/applications/prefill", {
    method: "POST",
    body: JSON.stringify({ text: trimmed, url: url.trim() }),
  });

  if (!res.ok) return apiFailure(res);
  return { ok: true, ...res.data };
}

export async function updateApplication(
  id: number,
  formData: FormData,
): Promise<ActionResult> {
  const application = pickApplicationFields(formData);
  application.lock_version = Number(formData.get("lock_version") ?? 0);

  const res = await apiFetch<Application>(`/applications/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ application }),
  });

  if (!res.ok) return apiFailure(res);

  await revalidateApplication(id);
  return { ok: true };
}

export async function transitionStatus(
  id: number,
  to: string,
  lockVersion: number,
  note?: string,
): Promise<ActionResult> {
  const res = await apiFetch<Application>(`/applications/${id}/transition`, {
    method: "PATCH",
    body: JSON.stringify({ status: to, lock_version: lockVersion, note: note ?? null }),
  });
  if (!res.ok) return apiFailure(res);
  await revalidateApplication(id);
  return { ok: true };
}

export async function uploadFile(
  id: number,
  field: "resume" | "cover_letter",
  formData: FormData,
): Promise<ActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return localFailure("chooseFile");
  }

  const upstream = new FormData();
  upstream.append(`application[${field}]`, file);

  const res = await apiFetch<Application>(`/applications/${id}`, {
    method: "PATCH",
    body: upstream,
  });

  if (!res.ok) return apiFailure(res);
  // Detail page only — an upload leaves the dashboard listing unchanged.
  revalidatePath(getPathname({ href: `/applications/${id}`, locale: await getLocale() }));
  return { ok: true };
}

// Resolves only on failure — the success path ends in redirect(), which throws.
export async function deleteApplication(id: number): Promise<ActionFailure> {
  const res = await apiFetch(`/applications/${id}`, { method: "DELETE" });
  if (!res.ok) return apiFailure(res);
  const locale = await getLocale();
  revalidatePath(getPathname({ href: "/dashboard", locale }));
  redirect({ href: "/dashboard", locale });
}

// --- Passkeys (SPEC.md § Passkeys; § Auth flow) ------------------------------
//
// The *authenticated* halves of the enrollment ceremony are ordinary API calls,
// so they are server actions like every other authenticated mutation. Only the
// unauthenticated sign-in legs are route handlers, because only they must lift
// the Authorization header into the session cookie.

// The ceremony JSON is opaque to this layer: it is produced by the webauthn gem
// and consumed by PublicKeyCredential.parseCreationOptionsFromJSON in the
// browser. Typing it field-by-field here would be a hand-copied contract.
export type PasskeyOptionsResult =
  | { ok: true; options: Record<string, unknown> }
  | ActionFailure;

export async function getPasskeyRegistrationOptions(): Promise<PasskeyOptionsResult> {
  const res = await apiFetch<Record<string, unknown>>("/passkeys/options", {
    method: "POST",
  });
  if (!res.ok) return apiFailure(res);
  return { ok: true, options: res.data };
}

export async function registerPasskey(
  credential: unknown,
  nickname: string,
): Promise<ActionResult> {
  const res = await apiFetch("/passkeys", {
    method: "POST",
    body: JSON.stringify({ credential, nickname: nickname.trim() || null }),
  });
  if (!res.ok) return apiFailure(res);

  revalidatePath(getPathname({ href: "/settings", locale: await getLocale() }));
  return { ok: true };
}

export async function deletePasskey(id: number): Promise<ActionResult> {
  const res = await apiFetch(`/passkeys/${id}`, { method: "DELETE" });
  if (!res.ok) return apiFailure(res);

  revalidatePath(getPathname({ href: "/settings", locale: await getLocale() }));
  return { ok: true };
}

// --- Push subscriptions (SPEC.md § Push notifications) -----------------------
//
// Authenticated API calls, so server actions — the same division of labour as
// the passkey enrollment actions above. The public key is fetched from the API
// rather than duplicated into a web-side env var, so the two services cannot
// drift.

export type PushPublicKeyResult = { ok: true; publicKey: string } | ActionFailure;

export async function getPushPublicKey(): Promise<PushPublicKeyResult> {
  const res = await apiFetch<{ public_key: string }>("/push_subscriptions/public_key");
  if (!res.ok) return apiFailure(res);
  return { ok: true, publicKey: res.data.public_key };
}

// `subscription` is the browser PushSubscription's toJSON() output — opaque to
// this layer for the same reason the passkey ceremony JSON is.
export async function subscribePush(subscription: unknown): Promise<ActionResult> {
  const res = await apiFetch("/push_subscriptions", {
    method: "POST",
    body: JSON.stringify({ subscription }),
  });
  if (!res.ok) return apiFailure(res);
  return { ok: true };
}

export async function unsubscribePush(endpoint: string): Promise<ActionResult> {
  const res = await apiFetch("/push_subscriptions", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) return apiFailure(res);
  return { ok: true };
}

type ApplicationInput = {
  company?: string;
  role?: string;
  url?: string | null;
  notes?: string | null;
  follow_up_at?: string | null;
  lock_version?: number;
};

function pickApplicationFields(formData: FormData): ApplicationInput {
  const get = (key: string) => {
    const v = formData.get(key);
    return typeof v === "string" ? v.trim() : "";
  };
  return {
    company: get("company") || undefined,
    role: get("role") || undefined,
    url: get("url") || null,
    notes: get("notes") || null,
    follow_up_at: get("follow_up_at") || null,
  };
}
