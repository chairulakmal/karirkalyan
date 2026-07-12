import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalPage } from "@/app/components/legal-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "terms" });

  return { title: t("title"), description: t("lede") };
}

const SECTIONS = ["what", "accounts", "demo", "asIs", "acceptable", "changes"] as const;

export default function Terms() {
  return <LegalPage namespace="terms" sections={SECTIONS} />;
}
