import type { Metadata } from "next";
import { Navbar } from "@/components/navbar";
import { HeroSection } from "@/components/hero-section-brutalist";
import { FeatureGrid } from "@/components/feature-grid";
import { AboutSection } from "@/components/about-section";
import { PricingSection } from "@/components/pricing-section-brutalist";
import { GlitchMarquee } from "@/components/glitch-marquee";
import { Footer } from "@/components/footer-brutalist";

const homepageTitle = "Shorlabs | Open Source Full-Stack Deployment Platform";
const homepageDescription =
  "Deploy your frontend and backend from one place. Serverless, so you only pay when your code runs.";

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
    url: "https://shorlabs.com",
    description: homepageDescription,
  };

  return (
    <div className="min-h-screen dot-grid-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <Navbar />
      <main>
        <HeroSection />
        <FeatureGrid />
        <AboutSection />
        <PricingSection />
        <GlitchMarquee />
      </main>
      <Footer />
    </div>
  );
}
