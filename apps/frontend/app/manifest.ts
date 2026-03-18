import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shorlabs",
    short_name: "Shorlabs",
    description:
      "Push to GitHub, deploy your backend. Shorlabs is the push-to-deploy platform for Go, Python, Node.js, and any Dockerized service.",
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
