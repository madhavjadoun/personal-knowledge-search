import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://quizgens.tech";

  const staticPages = [
    "",
    "/login",
    "/contact",
    "/faq",
    "/privacy",
    "/terms",
    "/tools",
  ];

  const sitemapEntries: MetadataRoute.Sitemap = staticPages.map((page) => {
    let priority = 0.5;
    let changeFrequency: "daily" | "weekly" | "monthly" | "yearly" = "monthly";

    if (page === "") {
      priority = 1.0;
      changeFrequency = "daily";
    } else if (page === "/tools") {
      priority = 0.8;
      changeFrequency = "daily";
    }

    return {
      url: `${baseUrl}${page}`,
      lastModified: new Date(),
      changeFrequency,
      priority,
    };
  });

  return sitemapEntries;
}