import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Latest articles, tutorials, and updates from the Shorlabs team on backend deployments and developer tooling.",
  alternates: {
    canonical: "/blog",
  },
};

export default function Blog() {
  const posts = getAllPosts();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Shorlabs Blog",
    description:
      "Latest articles, tutorials, and updates from the Shorlabs team on backend deployments and developer tooling.",
    url: "https://shorlabs.com/blog",
    publisher: {
      "@type": "Organization",
      name: "Shorlabs",
      url: "https://shorlabs.com",
    },
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 32 }}>Blog</h1>
      {posts.length === 0 && <p>No posts yet.</p>}
      {posts.map((post) => (
        <article key={post.slug} style={{ marginBottom: 32 }}>
          <Link
            href={`/blog/${post.slug}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>
              {post.title}
            </h2>
            <p style={{ color: "#888", fontSize: 14, marginBottom: 4 }}>
              {post.date} · {post.author}
            </p>
            <p style={{ fontSize: 16 }}>{post.summary}</p>
          </Link>
        </article>
      ))}
    </div>
  );
}
