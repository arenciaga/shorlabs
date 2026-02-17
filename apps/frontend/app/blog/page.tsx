import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getAllPosts } from "@/lib/blog";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Latest articles, tutorials, and updates from the Shorlabs team on backend deployments and developer tooling.",
  alternates: {
    canonical: "/blog",
  },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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
    <div className="max-w-[1120px] mx-auto px-4 sm:px-6 py-6 lg:py-8 pb-10 lg:pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <header className="mb-6 sm:mb-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Blog
        </h1>
        <p className="mt-2 text-sm sm:text-base text-gray max-w-2xl mx-auto">
          Product updates and engineering notes from Shorlabs.
        </p>
      </header>

      {posts.length === 0 && (
        <p className="text-gray text-base py-8 border-t border-border">No posts yet.</p>
      )}

      <div
        className={cn(
          "grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5 lg:gap-6",
          posts.length === 1 && "sm:grid-cols-1 max-w-xl mx-auto w-full"
        )}
      >
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="block rounded-xl overflow-hidden border border-border bg-background no-underline group hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200"
          >
            <div className="relative aspect-[16/10] overflow-hidden">
              {post.image ? (
                <Image
                  src={post.image}
                  alt={post.title}
                  fill
                  sizes="(max-width: 640px) 100vw, 50vw"
                  className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460]" />
              )}
            </div>
            <div className="p-4 sm:p-5">
              <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground group-hover:opacity-75 transition-opacity">
                {post.title}
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-gray">
                {formatDate(post.date)} · {post.readingTime}{" "}
                {post.readingTime === 1 ? "minute" : "minutes"} read
              </p>
              <p className="mt-3 text-sm sm:text-base text-foreground leading-relaxed">
                {post.summary}
              </p>
              <span className="mt-3 inline-flex items-center text-xs sm:text-sm font-semibold uppercase tracking-wide text-foreground group-hover:opacity-75 transition-opacity">
                Read article
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
