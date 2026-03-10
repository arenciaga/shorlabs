import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shorlabs",
    short_name: "Shorlabs",
    description:
      "Shorlabs provides the infrastructure to deploy serverless web apps and databases, scale instantly, and only pay for what you use.",
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
