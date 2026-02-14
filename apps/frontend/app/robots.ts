import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/projects",
        "/new",
        "/settings",
        "/sign-in",
        "/create-account",
        "/sso-callback",
        "/api",
      ],
    },
    sitemap: "https://shorlabs.com/sitemap.xml",
  };
}
