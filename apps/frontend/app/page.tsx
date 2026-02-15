import type { Metadata } from "next";
import { HeroSection } from "@/components/HeroSection";
import { HowItWorksSection } from "@/components/HowItWorksSection";
import { FeatureSection } from "@/components/FeatureSection";
import { PricingSection } from "@/components/PricingSection";
import { CTASection } from "@/components/CTASection";
import { Footer } from "@/components/Footer";
import SectionNavigation from "@/components/SectionNavigation";

export const metadata: Metadata = {
  title: {
    absolute: "Shorlabs — The serverless platform for frontends and backends",
  },
  description:
    "The serverless platform for frontends and backends. Next.js, React, FastAPI, Express—all with pay-per-request pricing. No idle costs. No container limits.",
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
    description:
      "The serverless platform for frontends and backends. Next.js, React, FastAPI, Express—all with pay-per-request pricing. No idle costs. No container limits.",
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



