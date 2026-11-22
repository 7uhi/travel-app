import type { MetadataRoute } from "next";

/** Installs Roam as a full-screen app. Cream matches the page background. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Roam",
    short_name: "Roam",
    description: "Plan trips day by day, together.",
    // The home page sends signed-in users from this URL straight to their trips.
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#f4f1e9",
    theme_color: "#f4f1e9",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
