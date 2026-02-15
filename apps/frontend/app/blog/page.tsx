import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getAllPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Latest articles, tutorials, and updates from the Shorlabs team on backend deployments and developer tooling.",
  alternates: {
    canonical: "/blog",
  },
};

const ALL_CATEGORIES = [
  "Featured",
  "Company",
  "Product",
  "Developer",
  "Update",
];

export default function Blog() {
  const posts = getAllPosts();
  const latestPost = posts[0];
  const remainingPosts = posts.slice(1);

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
    <div className="max-w-[1120px] mx-auto px-4 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      {/* ── Hero: Latest post ─────────────────────────────── */}
      {latestPost && (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1.2fr] gap-5 md:gap-8 lg:gap-12 items-center py-6 md:py-8 lg:py-12 border-b border-border mb-6 md:mb-8">
          <div className="flex flex-col gap-3 md:gap-4">
            <span className="inline-block w-fit px-3 py-1 rounded-full bg-foreground text-background text-[0.65rem] font-semibold uppercase tracking-wider">
              {latestPost.category}
            </span>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-[1.15] tracking-tight text-foreground">
              {latestPost.title}
            </h1>
            <p className="text-sm md:text-base text-gray leading-relaxed">
              {latestPost.summary}
            </p>
            <Link
              href={`/blog/${latestPost.slug}`}
              className="inline-flex items-center gap-2 w-fit px-5 py-2.5 rounded-full bg-foreground text-background text-xs font-semibold uppercase tracking-wider hover:opacity-85 hover:-translate-y-0.5 transition-all duration-200"
            >
              Read Article
            </Link>
          </div>

          <Link
            href={`/blog/${latestPost.slug}`}
            className="relative w-full aspect-video md:aspect-[16/10] rounded-xl lg:rounded-2xl overflow-hidden group"
          >
            {latestPost.image ? (
              <Image
                src={latestPost.image}
                alt={latestPost.title}
                fill
                sizes="(max-width: 768px) 100vw, 55vw"
                className="object-cover"
                priority
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/55 flex flex-col justify-end p-4 lg:p-6">
              <span className="text-base sm:text-lg lg:text-2xl font-bold text-white leading-tight tracking-tight">
                {latestPost.title}
              </span>
            </div>
          </Link>
        </section>
      )}

      {/* ── Category pills ────────────────────────────────── */}
      <div className="flex flex-nowrap sm:flex-wrap gap-2 py-3 md:py-4 pb-5 md:pb-8 overflow-x-auto sm:overflow-visible">
        {ALL_CATEGORIES.map((cat) => (
          <span
            key={cat}
            className="shrink-0 px-3.5 py-1.5 rounded-full border border-border text-foreground text-xs sm:text-sm font-medium cursor-pointer hover:bg-foreground hover:text-background hover:border-foreground transition-all duration-150"
          >
            {cat}
          </span>
        ))}
      </div>

      {/* ── Post grid ─────────────────────────────────────── */}
      {posts.length === 0 && (
        <p className="text-gray text-base py-8">No posts yet.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5 lg:gap-6 pb-10 md:pb-16">
        {(remainingPosts.length > 0 ? remainingPosts : posts).map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="relative rounded-xl lg:rounded-2xl overflow-hidden aspect-[4/3] cursor-pointer hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 no-underline text-white group"
          >
            {post.image ? (
              <Image
                src={post.image}
                alt={post.title}
                fill
                sizes="(max-width: 640px) 100vw, 50vw"
                className="object-cover absolute inset-0"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-black/60 flex flex-col justify-between p-4 lg:p-5">
              <span className="inline-block w-fit px-2.5 py-0.5 rounded-full bg-foreground text-background text-[0.6rem] sm:text-[0.65rem] font-semibold uppercase tracking-wider">
                {post.category}
              </span>
              <span className="text-sm sm:text-base lg:text-xl font-bold leading-tight tracking-tight text-white">
                {post.title}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
