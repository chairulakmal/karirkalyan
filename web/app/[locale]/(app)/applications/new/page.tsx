import { getTranslations } from "next-intl/server";
import { NewApplicationForm } from "./new-application-form";

export default async function NewApplicationPage() {
  const t = await getTranslations("newApplication");

  return (
    <div className="mx-auto max-w-2xl">
      <p className="kk-label">{t("eyebrow")}</p>
      <h1 className="mt-1 text-3xl">{t("title")}</h1>
      <p className="mt-1 text-sm text-ink-soft">
        {t.rich("lede", {
          code: (chunks) => <code className="font-mono">{chunks}</code>,
        })}
      </p>
      <NewApplicationForm />
    </div>
  );
}
