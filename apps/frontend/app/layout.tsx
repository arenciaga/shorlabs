import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Amplitude } from "@/lib/amplitude";
import { AmplitudeProvider } from "@/components/AmplitudeProvider";
import { AutumnProviderWrapper } from "@/components/AutumnProviderWrapper";
import { Toaster } from "@/components/ui/sonner";
import { homepageTitle, homepageDescription } from "@/lib/seo";
import "./globals.css";

// Geist Sans - clean, modern sans-serif by Vercel
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

// Geist Mono - monospace companion
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.shorlabs.com"),
  title: {
    template: "%s | Shorlabs",
    default: homepageTitle,
  },
  description: homepageDescription,
  openGraph: {
    title: homepageTitle,
    description: homepageDescription,
    url: "https://www.shorlabs.com",
    siteName: "Shorlabs",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/Main.png",
        width: 1200,
        height: 630,
        alt: "Shorlabs",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: homepageTitle,
    description: homepageDescription,
    images: ["/Main.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "/",
    types: {
      "application/rss+xml": "/feed.xml",
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      localization={{
        formButtonPrimary: "Sign in",
      }}
    >
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
          suppressHydrationWarning
        >
          <Amplitude />
          <AmplitudeProvider>
            <AutumnProviderWrapper>
              {children}
              <Toaster />
            </AutumnProviderWrapper>
          </AmplitudeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
