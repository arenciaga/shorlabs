import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Shorlabs terms of service — the rules and guidelines for using our platform.",
  alternates: {
    canonical: "/terms-of-service",
  },
};

export default function TermsOfService() {
    return (
        <div>
            <h1>Terms of Service</h1>
        </div>
    );
}
