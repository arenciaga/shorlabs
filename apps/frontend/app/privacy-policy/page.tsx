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
    <main className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        <div className="prose prose-gray dark:prose-invert max-w-none">
          <h1>Privacy Policy</h1>
          <p className="lead">Last Updated: March 19, 2026</p>

          <p>
            Welcome to Shorlabs. Ship Software in Peace. This Privacy Policy outlines how Shorlabs ("we", "us", "our") collects, uses, protects, and handles your personal information when you use our Platform-as-a-Service (PaaS) and related services at shorlabs.com.
          </p>

          <h2>1. Information We Collect</h2>
          <p>We collect information to provide, manage, and improve our platform. The types of data include:</p>
          <ul>
            <li><strong>Account Data:</strong> When you sign up, we collect personal details such as your name, email address, and authentication credentials through our authentication provider (Clerk).</li>
            <li><strong>Repository & Code Data:</strong> By connecting your GitHub account, we request access to your repositories to facilitate automatic deployments. We collect metadata regarding your repositories, commits, and deploy status.</li>
            <li><strong>Usage & Telemetry Data:</strong> We monitor your usage metrics, including deployment frequencies, application traffic, bandwidth, and compute usage using Amplitude to enforce billing limits and improve service reliability.</li>
            <li><strong>Technical Infrastructure Data:</strong> We store deployment logs securely on AWS infrastructure to provide you with real-time runtime and build logs.</li>
          </ul>

          <h2>2. How We Use Your Information</h2>
          <p>Your data is strictly processed to deliver our PaaS services. We use it to:</p>
          <ul>
            <li>Authenticate and secure your account.</li>
            <li>Provision infrastructure, build your applications, and stream logs.</li>
            <li>Monitor platform scaling, flexible compute usage, and bill you according to our "pay per request" model.</li>
            <li>Communicate platform updates, downtime alerts, or legal changes.</li>
            <li>Enhance security and prevent fraud or abuse of our systems.</li>
          </ul>

          <h2>3. Information Sharing & Third-Party Services</h2>
          <p>We do not sell your personal data. We only share necessary information with trusted third-party sub-processors who assist us in operating our platform:</p>
          <ul>
            <li><strong>Amazon Web Services (AWS):</strong> Hosting our core infrastructure, running serverless functions, and storing deployment logs securely.</li>
            <li><strong>GitHub:</strong> Used for repository connection and webhook automated deployments.</li>
            <li><strong>Clerk:</strong> Managing user identity and authentication securely.</li>

            <li><strong>Amplitude:</strong> Analyzing aggregated, anonymized user telemetry to improve the platform experience.</li>
          </ul>

          <h2>4. Data Security</h2>
          <p>We employ "Privacy by Design" principles and industry-standard security practices. Our database and cloud resources are protected by restrictive IAM roles, encrypted at rest, and accessed exclusively over secure connections (HTTPS/TLS). While we use robust protocols (such as AWS KMS and secure secrets management), no method of transmission over the Internet is 100% secure.</p>

          <h2>5. Your Data Rights (GDPR & CCPA)</h2>
          <p>Depending on your location, you may have rights regarding your personal data, including:</p>
          <ul>
            <li><strong>Right to Access:</strong> You can request a copy of your personal data currently held by us.</li>
            <li><strong>Right to Rectification:</strong> You can update or correct inaccuracies in your account.</li>
            <li><strong>Right to Erasure ("Right to be Forgotten"):</strong> You can request the deletion of your account and associated personal data. Upon termination, code and logs will be permanently deleted from our servers.</li>
            <li><strong>Right to Data Portability:</strong> You can request export of your personal data in a structured, commonly used format.</li>
          </ul>

          <h2>6. Data Retention</h2>
          <p>We retain your account data and deployment logs for as long as your account is active, or as needed to provide our services and comply with legal obligations. Runtime logs are typically ephemeral but accessible through your dashboard up to a certain threshold defined by your tier. If you delete your account, we trigger an immediate teardown of your associated infrastructure and scheduled deletion of your data.</p>

          <h2>7. Contact Us</h2>
          <p>If you have any questions or requests regarding your data and this Privacy Policy, please contact us at privacy@shorlabs.com.</p>
        </div>
      </div>
    </main>
  );
}
