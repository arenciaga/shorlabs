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
    absolute: "Shorlabs — Deploy backends like you deploy frontends",
  },
  description:
    "Deploy backends like you deploy frontends. Push your code, and Shorlabs builds, deploys, and serves it.",
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
      "Deploy backends like you deploy frontends. Push your code, and Shorlabs builds, deploys, and serves it.",
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



