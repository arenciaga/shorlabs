import { ImageResponse } from "next/og";

export const alt = "Shorlabs Blog";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
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
            letterSpacing: "0.15em",
            textTransform: "uppercase" as const,
          }}
        >
          www.shorlabs.com
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1.1,
            marginBottom: 32,
            display: "flex",
          }}
        >
          Shorlabs Blog
        </div>
        <div
          style={{
            fontSize: 24,
            color: "#aaa",
            display: "flex",
            lineHeight: 1.5,
            maxWidth: "800px",
          }}
        >
          Practical guides for deployment, cloud cost optimization, and growth
          playbooks.
        </div>
      </div>
    ),
    { ...size }
  );
}
