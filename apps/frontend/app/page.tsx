import type { Metadata } from "next";
import { Navbar } from "@/components/navbar";
import { HeroSection } from "@/components/hero-section-brutalist";
import { FeatureGrid } from "@/components/feature-grid";
import { AboutSection } from "@/components/about-section";
import { PricingSection } from "@/components/pricing-section-brutalist";
import { GlitchMarquee } from "@/components/glitch-marquee";
import { CtaSection } from "@/components/cta-section-brutalist";
import { Footer } from "@/components/footer-brutalist";

const homepageTitle = "Shorlabs: The infra for serverless web apps and data storage.";
const homepageDescription =
  "Shorlabs provides the infrastructure to deploy serverless web apps and databases, scale instantly, and only pay for what you use.";

export const metadata: Metadata = {
  title: {
    absolute: homepageTitle,
  },
  description: homepageDescription,
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
    <div className="min-h-screen dot-grid-bg overflow-x-clip">
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
