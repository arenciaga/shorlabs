import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Shorlabs privacy policy — how we collect, use, and protect your data.",
  alternates: {
    canonical: "/privacy-policy",
  },
};

export default function PrivacyPolicy() {
    return (
        <div>
            <h1>Privacy Policy</h1>
        </div>
    );
}
