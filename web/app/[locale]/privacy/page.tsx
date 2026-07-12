import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalPage } from "@/app/components/legal-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "privacy" });

  return { title: t("title"), description: t("lede") };
}

// Every claim below is checkable against SPEC.md. Nothing here may promise a
// control the code does not have — there is no self-service delete button, and
// this page does not pretend otherwise. See SPEC.md § Legal pages.
const SECTIONS = [
  "who",
  "collected",
  "stored",
  "shared",
  "notCollected",
  "export",
  "erasure",
  "contact",
] as const;

export default function Privacy() {
  return <LegalPage namespace="privacy" sections={SECTIONS} />;
}
