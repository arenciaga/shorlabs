import { ImageResponse } from "next/og";
import { getPostBySlug } from "@/lib/blog";

export const alt = "Shorlabs Blog";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  const title = post?.meta.title ?? "Shorlabs Blog";
  const author = post?.meta.author ?? "Shorlabs";

  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
        }}
      >
        <div
          style={{
            fontSize: 24,
            color: "#888",
            marginBottom: 24,
            display: "flex",
          }}
        >
          shorlabs.com
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1.2,
            marginBottom: 32,
            display: "flex",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 24,
            color: "#aaa",
            display: "flex",
          }}
        >
          By {author}
        </div>
      </div>
    ),
    { ...size }
  );
}
