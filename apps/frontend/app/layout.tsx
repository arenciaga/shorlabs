import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { AmplitudeProvider } from "@/components/AmplitudeProvider";
import { AutumnProviderWrapper } from "@/components/AutumnProviderWrapper";
import { Toaster } from "@/components/ui/sonner";
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
  metadataBase: new URL("https://shorlabs.com"),
  title: {
    template: "%s | Shorlabs",
    default: "Shorlabs — Deploy backends like you deploy frontends",
  },
  description:
    "Deploy backends like you deploy frontends. Push your code, and Shorlabs builds, deploys, and serves it.",
  openGraph: {
    title: "Shorlabs",
    description:
      "Deploy backends like you deploy frontends. Push your code, and Shorlabs builds, deploys, and serves it.",
    url: "https://shorlabs.com",
    siteName: "Shorlabs",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
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
        formButtonPrimary: 'Sign in',
      }}
    >
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
          suppressHydrationWarning
        >
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
