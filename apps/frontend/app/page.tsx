import { HeroSection } from "@/components/HeroSection";
import { HowItWorksSection } from "@/components/HowItWorksSection";
import { FeatureSection } from "@/components/FeatureSection";
import { PricingSection } from "@/components/PricingSection";
import { CTASection } from "@/components/CTASection";
import { Footer } from "@/components/Footer";
import SectionNavigation from "@/components/SectionNavigation";

export default function Home() {
  return (
    <>
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



