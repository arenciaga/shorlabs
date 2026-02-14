import { getAllPosts } from "@/lib/blog";

const BASE = "https://shorlabs.com";

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toIso(date: Date): string {
  return date.toISOString().split("T")[0] ?? date.toISOString();
}

export async function GET() {
  const posts = getAllPosts();

  const blogEntries = posts.map(
    (post) => `
  <url>
    <loc>${escapeXml(`${BASE}/blog/${post.slug}`)}</loc>
    <lastmod>${toIso(new Date(post.date))}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`
  );

  const urls = [
    `
  <url>
    <loc>${escapeXml(BASE)}</loc>
    <lastmod>${toIso(new Date())}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1</priority>
  </url>`,
    `
  <url>
    <loc>${escapeXml(`${BASE}/blog`)}</loc>
    <lastmod>${toIso(new Date())}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
    `
  <url>
    <loc>${escapeXml(`${BASE}/privacy-policy`)}</loc>
    <lastmod>${toIso(new Date())}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>`,
    `
  <url>
    <loc>${escapeXml(`${BASE}/terms-of-service`)}</loc>
    <lastmod>${toIso(new Date())}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>`,
    ...blogEntries,
  ].join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
