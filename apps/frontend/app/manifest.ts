import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shorlabs",
    short_name: "Shorlabs",
    description:
      "The serverless platform for frontends and backends. Next.js, React, FastAPI, Express—all with pay-per-request pricing. No idle costs. No container limits.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#000000",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
