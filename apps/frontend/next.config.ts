import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: 'standalone', // ← ADD THIS for monorepo deployment
  
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  
  // Enable compression
  compress: true,
  
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },
  
  // Reduce JavaScript bundle size
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  
  // Optimize production builds
  productionBrowserSourceMaps: false,
  
  // Enable experimental optimizations
  experimental: {
    optimizeCss: true,
  },
  
  // Set caching headers for static assets
  async headers() {
    return [
      {
        source: '/:all*(mp4|webm|ogg)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
