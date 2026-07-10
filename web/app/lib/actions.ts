"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch } from "./api";
import type { Application } from "./types";

// A failed action; `status` is the upstream HTTP status when the failure came
// from the API (absent for local validation failures). Callers key off it to
// recover from a 409 optimistic-lock conflict.
export type ActionFailure = { ok: false; error: string; status?: number };
export type ActionResult = { ok: true } | ActionFailure;

// Resolves only on failure — the success path ends in redirect(), which throws
// and never returns. Typing it as ActionFailure keeps call sites honest.
export async function createApplication(formData: FormData): Promise<ActionFailure> {
  const company = formData.get("company")?.toString().trim();
  const role = formData.get("role")?.toString().trim();
  if (!company || !role) {
    return { ok: false, error: "Company and role are required" };
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

  if (!res.ok) return { ok: false, error: res.error, status: res.status };

  revalidatePath("/dashboard");
  redirect(`/applications/${res.data.id}`);
}

export type PrefillResult =
  | { ok: true; company: string; role: string; notes: string; url: string }
  | { ok: false; error: string };

export async function prefillFromUrl(url: string): Promise<PrefillResult> {
  const trimmed = url.trim();
  if (!trimmed) return { ok: false, error: "Paste a job posting URL first." };

  const res = await apiFetch<{
    company: string;
    role: string;
    notes: string;
    url: string;
  }>("/applications/prefill", {
    method: "POST",
    body: JSON.stringify({ url: trimmed }),
  });

  if (!res.ok) return { ok: false, error: res.error };
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

  if (!res.ok) return { ok: false, error: res.error, status: res.status };

  revalidatePath(`/applications/${id}`);
  revalidatePath("/dashboard");
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
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  revalidatePath(`/applications/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function uploadFile(
  id: number,
  field: "resume" | "cover_letter",
  formData: FormData,
): Promise<ActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a PDF file" };
  }

  const upstream = new FormData();
  upstream.append(`application[${field}]`, file);

  const res = await apiFetch<Application>(`/applications/${id}`, {
    method: "PATCH",
    body: upstream,
  });

  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  revalidatePath(`/applications/${id}`);
  return { ok: true };
}

// Resolves only on failure — the success path ends in redirect(), which throws.
export async function deleteApplication(id: number): Promise<ActionFailure> {
  const res = await apiFetch(`/applications/${id}`, { method: "DELETE" });
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  revalidatePath("/dashboard");
  redirect("/dashboard");
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
