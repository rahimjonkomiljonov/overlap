import type { MetadataRoute } from "next";

/** Lets phones offer "Add to Home Screen" and open Overlap full screen, with the logo as its icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Overlap",
    short_name: "Overlap",
    description: "Meet the people on your campus you already share a day with.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf8f3",
    theme_color: "#faf8f3",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
