import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import rehypePrettyCode from "rehype-pretty-code";
import { isValidElement, type HTMLAttributes, type ReactNode } from "react";
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

function slugifyHeading(text: string) {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");

  return slug || "section";
}

/* Extract headings from markdown content for the TOC */
function extractHeadings(content: string) {
  const headings: { text: string; level: number; id: string }[] = [];
  const slugCounts = new Map<string, number>();
  const regex = /^(#{2,3})\s+(.+)$/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const text = match[2].trim();
    const baseId = slugifyHeading(text);
    const count = slugCounts.get(baseId) ?? 0;
    slugCounts.set(baseId, count + 1);
    const id = count === 0 ? baseId : `${baseId}-${count}`;
    headings.push({ text, level: match[1].length, id });
  }
  return headings;
}

function getTextFromNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getTextFromNode).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getTextFromNode(node.props.children);
  }

  return "";
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* Share icons as inline SVGs */
function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export default async function BlogPost({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const headings = extractHeadings(post.content);
  const renderedHeadingCounts = new Map<string, number>();

  const getHeadingId = (children: ReactNode) => {
    const headingText = getTextFromNode(children).trim();
    const baseId = slugifyHeading(headingText);
    const count = renderedHeadingCounts.get(baseId) ?? 0;
    renderedHeadingCounts.set(baseId, count + 1);
    return count === 0 ? baseId : `${baseId}-${count}`;
  };

  const mdxComponents = {
    h2: ({ children, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
      <h2 id={getHeadingId(children)} {...props}>
        {children}
      </h2>
    ),
    h3: ({ children, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
      <h3 id={getHeadingId(children)} {...props}>
        {children}
      </h3>
    ),
  };

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

  const shareUrl = `https://shorlabs.com/blog/${slug}`;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-0 lg:gap-12 max-w-[1080px] mx-auto px-4 sm:px-6 py-6 lg:py-8 pb-10 lg:pb-16">
        {/* ── Sidebar: Table of contents ──────────────────── */}
        <aside className="hidden lg:block sticky top-[4.5rem] self-start pt-2">
          <h4 className="text-sm font-bold mb-4 text-foreground">On this page</h4>
          <nav className="flex flex-col">
            {headings.map((h) => (
              <a
                key={h.id}
                href={`#${h.id}`}
                className={`block py-1 text-xs text-gray no-underline hover:text-foreground transition-colors leading-snug ${h.level === 3 ? "pl-3 text-[0.7rem]" : ""
                  }`}
              >
                {h.text}
              </a>
            ))}
          </nav>
        </aside>

        {/* ── Main content ────────────────────────────────── */}
        <article>
          {/* Top bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 sm:pb-6 border-b border-border mb-4 sm:mb-6">
            <div className="flex items-center gap-3">
              <Link
                href="/blog"
                className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-foreground no-underline hover:opacity-70 transition-opacity"
              >
                ‹ Blog
              </Link>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-border bg-transparent text-foreground cursor-pointer hover:bg-accent hover:border-foreground transition-all"
                title="Copy link"
                aria-label="Copy link"
              >
                <CopyIcon />
              </button>
              <a
                href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(post.meta.title)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-border bg-transparent text-foreground hover:bg-accent hover:border-foreground transition-all"
                title="Share on X"
                aria-label="Share on X"
              >
                <XIcon />
              </a>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-border bg-transparent text-foreground hover:bg-accent hover:border-foreground transition-all"
                title="Share on LinkedIn"
                aria-label="Share on LinkedIn"
              >
                <LinkedInIcon />
              </a>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-border bg-transparent text-foreground hover:bg-accent hover:border-foreground transition-all"
                title="Share on Facebook"
                aria-label="Share on Facebook"
              >
                <FacebookIcon />
              </a>
            </div>
          </div>

          {/* Article header */}
          <div className="pb-4 sm:pb-6">
            <h1 className="text-xl sm:text-2xl lg:text-[2rem] font-bold leading-[1.15] tracking-tight mb-2 sm:mb-3 text-foreground">
              {post.meta.title}
            </h1>
            <p className="text-xs sm:text-sm text-gray mb-1.5">
              {formatDate(post.meta.date)} · {post.meta.readingTime}{" "}
              {post.meta.readingTime === 1 ? "minute" : "minutes"} reading time
            </p>
            <p className="text-xs sm:text-sm text-foreground">
              <strong className="font-semibold">{post.meta.author}</strong>
            </p>
          </div>

          {/* Summary */}
          <p className="text-sm sm:text-base lg:text-lg leading-relaxed lg:leading-[1.7] text-foreground pb-4 sm:pb-6">
            {post.meta.summary}
          </p>

          {/* Hero image */}
          {post.meta.image && (
            <div className="relative w-full aspect-video rounded-xl lg:rounded-2xl overflow-hidden mb-6 sm:mb-8 lg:mb-10">
              <Image
                src={post.meta.image}
                alt={post.meta.title}
                fill
                sizes="(max-width: 768px) 100vw, 800px"
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-black/55 flex items-end p-4 sm:p-6 lg:p-8">
                <span className="text-lg sm:text-xl lg:text-2xl font-bold text-white leading-tight tracking-tight">
                  {post.meta.title}
                </span>
              </div>
            </div>
          )}

          <div className="prose max-w-none text-sm sm:text-base lg:text-[1.05rem] leading-relaxed lg:leading-[1.8] text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-p:text-foreground prose-li:text-foreground prose-blockquote:text-foreground prose-a:text-foreground prose-a:font-medium prose-a:no-underline hover:prose-a:opacity-70 prose-headings:scroll-mt-20 prose-h2:text-lg prose-h2:sm:text-xl prose-h2:lg:text-2xl prose-h2:font-bold prose-h2:tracking-tight prose-h2:mt-8 prose-h2:lg:mt-10 prose-h2:mb-3 prose-h3:text-base prose-h3:sm:text-lg prose-h3:font-semibold prose-h3:tracking-tight prose-h3:mt-6 prose-h3:lg:mt-8 prose-h3:mb-2 prose-p:mb-4">
            <MDXRemote
              source={post.content}
              components={mdxComponents}
              options={{
                mdxOptions: {
                  rehypePlugins: [
                    [
                      rehypePrettyCode,
                      {
                        theme: "github-dark",
                        keepBackground: true,
                      },
                    ],
                  ],
                },
              }}
            />
          </div>
        </article>
      </div>
    </>
  );
}
