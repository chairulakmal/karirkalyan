import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Fraunces, IBM_Plex_Mono, Manrope } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import "../globals.css";

// Fraunces and Manrope load as variable builds — one file per style instead of
// one per weight, and the only form in which the `font-variation-settings`
// rules in globals.css (`opsz`/`wght` cuts for headings, wordmark, display)
// actually bind. IBM Plex Mono has no variable build, so it stays static.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const BASE_URL = "https://kk.chairulakmal.com";
const TITLE = "KarirKalyan — Job Application Tracker";

// OpenGraph wants a full language_TERRITORY tag, not the bare locale segment.
const OG_LOCALE: Record<string, string> = { en: "en_US", ja: "ja_JP" };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  // The description is the homepage tagline, read from the catalog rather than
  // kept as a second copy here — a search result in Japanese should say what the
  // Japanese homepage says.
  const t = await getTranslations({ locale, namespace: "home" });
  const DESCRIPTION = t("tagline");

  return {
    metadataBase: new URL(BASE_URL),
    title: { default: TITLE, template: "%s — KarirKalyan" },
    description: DESCRIPTION,
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: BASE_URL,
      siteName: "KarirKalyan",
      type: "website",
      locale: OG_LOCALE[locale] ?? OG_LOCALE.en,
    },
    twitter: {
      card: "summary",
      title: TITLE,
      description: DESCRIPTION,
    },
    robots: { index: true, follow: true },
    icons: {
      icon: [
        { url: "/favicon.png", sizes: "32x32", type: "image/png" },
        { url: "/icon.png", sizes: "192x192", type: "image/png" },
      ],
      apple: { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    },
    manifest: "/manifest.webmanifest",
  };
}

export const viewport = {
  themeColor: "#1A2F6B",
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  // The [locale] segment is a catch-all for unknown top-level paths, so an
  // arbitrary string can land here. Validate before it reaches `lang`.
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Opt every route into dynamic rendering so the per-request CSP nonce from
  // proxy.ts reaches each page's scripts. Nonces are applied during SSR; a
  // statically prerendered page is built with no nonce and would be blocked by
  // the strict script-src in production (dev always renders dynamically, so
  // this only bites a production build). See web/proxy.ts.
  await connection();

  return (
    <html
      lang={locale}
      className={`${manrope.variable} ${fraunces.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-sand text-midnight flex flex-col">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
