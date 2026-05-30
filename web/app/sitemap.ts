import type { MetadataRoute } from "next";

const BASE_URL = "https://kk.chairulakmal.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE_URL, changeFrequency: "monthly", priority: 1 },
    { url: `${BASE_URL}/sign-up`, changeFrequency: "yearly", priority: 0.7 },
    { url: `${BASE_URL}/sign-in`, changeFrequency: "yearly", priority: 0.5 },
  ];
}
