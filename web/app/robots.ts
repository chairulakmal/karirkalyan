import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/sign-in", "/privacy", "/terms", "/llms.txt"],
        disallow: ["/dashboard", "/applications/", "/api/"],
      },
    ],
    sitemap: "https://kk.chairulakmal.com/sitemap.xml",
    host: "https://kk.chairulakmal.com",
  };
}
