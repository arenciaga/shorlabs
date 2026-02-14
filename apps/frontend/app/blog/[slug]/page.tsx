import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getAllPosts, getPostBySlug } from "@/lib/blog";

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return {};
  }

  return {
    title: post.meta.title,
    description: post.meta.summary,
    openGraph: {
      title: post.meta.title,
      description: post.meta.summary,
      type: "article",
      publishedTime: post.meta.date,
      authors: [post.meta.author],
    },
    alternates: {
      canonical: `/blog/${slug}`,
    },
  };
}

export default async function BlogPost({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.meta.title,
    description: post.meta.summary,
    datePublished: post.meta.date,
    author: {
      "@type": "Person",
      name: post.meta.author,
    },
    publisher: {
      "@type": "Organization",
      name: "Shorlabs",
      url: "https://shorlabs.com",
    },
    wordCount: post.content.trim().split(/\s+/).length,
    timeRequired: `PT${post.meta.readingTime}M`,
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <article>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
          {post.meta.title}
        </h1>
        <p style={{ color: "#888", fontSize: 14, marginBottom: 32 }}>
          {post.meta.date} · {post.meta.author} · {post.meta.readingTime} min read
        </p>
        <div className="prose">
          <MDXRemote source={post.content} />
        </div>
      </article>
    </div>
  );
}
