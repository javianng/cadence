import { type MetadataRoute } from "next";
import { siteConfig } from "~/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${siteConfig.name}: ${siteConfig.tagline}`,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/icon_transparent.png",
        sizes: "1462x1462",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
