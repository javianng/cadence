import { type MetadataRoute } from "next";
import { siteConfig } from "~/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: `${siteConfig.url}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteConfig.url}/login`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${siteConfig.url}/signup`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.5,
    },
  ];
}
