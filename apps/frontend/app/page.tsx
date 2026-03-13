import type { Metadata } from "next";
import { Navbar } from "@/components/navbar";
import { HeroSection } from "@/components/hero-section-brutalist";
import { FeatureGrid } from "@/components/feature-grid";
import { AboutSection } from "@/components/about-section";
import { PricingSection } from "@/components/pricing-section-brutalist";
import { GlitchMarquee } from "@/components/glitch-marquee";
import { CtaSection } from "@/components/cta-section-brutalist";
import { Footer } from "@/components/footer-brutalist";
import { homepageTitle, homepageDescription } from "@/lib/seo";

export const metadata: Metadata = {
  title: {
    absolute: homepageTitle,
  },
  description: homepageDescription,
  keywords: [
    "serverless deployment",
    "serverless web apps",
    "serverless database",
    "serverless PostgreSQL",
    "full stack deployment",
    "deploy web app",
    "cloud infrastructure",
    "auto-scaling",
    "pay per use hosting",
    "GitHub deploy",
    "containerized deployment",
    "custom domains",
    "Shorlabs",
  ],
  alternates: {
    canonical: "/",
  },
};

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Shorlabs",
    url: "https://www.shorlabs.com",
    description: homepageDescription,
  };

  return (
    <div className="min-h-screen overflow-x-clip">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <Navbar />
      <main>
        <HeroSection />
        <GlitchMarquee />
        <FeatureGrid />
        <AboutSection />
        <PricingSection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
