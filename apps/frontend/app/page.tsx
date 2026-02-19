import type { Metadata } from "next";
import { HeroSection } from "@/components/HeroSection";
import { HowItWorksSection } from "@/components/HowItWorksSection";
import { FeatureSection } from "@/components/FeatureSection";
import { PricingSection } from "@/components/PricingSection";
import { CTASection } from "@/components/CTASection";
import { Footer } from "@/components/Footer";
import SectionNavigation from "@/components/SectionNavigation";

const homepageTitle = "Shorlabs | The Open Source Full-Stack Deployment Platform";
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
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <SectionNavigation />
      <HeroSection />
      <FeatureSection />
      <HowItWorksSection />
      <PricingSection />
      <CTASection />
      <Footer />
    </>
  );
}
