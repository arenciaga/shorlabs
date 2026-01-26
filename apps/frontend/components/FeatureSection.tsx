"use client";

import {
    Zap,
    GitBranch,
    Globe,
    Key,
    Cpu,
    Clock,
    Terminal,
    Github,
    DollarSign,
    ServerOff,
} from "lucide-react";

const features = [
    {
        icon: Zap,
        title: "One-Click Deploy",
        description:
            "Connect your GitHub repository and deploy with a single click. No Docker knowledge required.",
    },
    {
        icon: GitBranch,
        title: "Auto Runtime Detection",
        description:
            "Shorlabs automatically detects Python or Node.js and configures the build for you.",
    },
    {
        icon: Globe,
        title: "Custom Subdomains",
        description:
            "Every project gets a unique project-name.shorlabs.com subdomain, instantly accessible.",
    },
    {
        icon: Key,
        title: "Environment Variables",
        description:
            "Securely configure environment variables through the dashboard. Supports .env imports.",
    },
    {
        icon: Cpu,
        title: "Configurable Compute",
        description:
            "Choose memory (up to 4GB), timeout (up to 300s), and ephemeral storage for your workload.",
    },
    {
        icon: Clock,
        title: "Deployment History",
        description:
            "Track every deployment with status, build logs, and timestamps at a glance.",
    },
    {
        icon: Terminal,
        title: "Runtime Logs",
        description:
            "View real-time CloudWatch logs directly from the dashboard. Debug with ease.",
    },
    {
        icon: Github,
        title: "GitHub Integration",
        description:
            "Seamless OAuth authentication and direct repository access. Import any repo instantly.",
    },
    {
        icon: DollarSign,
        title: "Pay-Per-Use",
        description:
            "Built on AWS Lambda—pay only for actual compute time. No idle servers, no wasted money.",
    },
    {
        icon: ServerOff,
        title: "Zero Infrastructure",
        description:
            "No servers to provision, no containers to manage. Deploy your code and forget the rest.",
    },
];

export const FeatureSection = () => {
    return (
        <section id="features" className="relative w-full bg-white">
            <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-8 sm:pb-12 text-center">
                <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
                    Everything you need to ship backends
                </h2>
                <p className="mt-3 text-gray-500 max-w-xl mx-auto">
                    Focus on writing code. We handle the infrastructure, scaling, and operations.
                </p>
            </div>

            <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
                <div className="grid grid-cols-1 md:grid-cols-2 border-t border-gray-100">
                    {features.map((feature, index) => {
                        const Icon = feature.icon;
                        const isLeft = index % 2 === 0;
                        const rowIndex = Math.floor(index / 2);
                        const isLastRow = rowIndex === Math.floor((features.length - 1) / 2);

                        return (
                            <div
                                key={feature.title}
                                className={`
                                    py-6 sm:py-8 px-0 sm:px-6
                                    ${isLeft ? "md:border-r border-gray-100" : ""}
                                    ${!isLastRow || (isLeft && features.length % 2 === 1) ? "border-b border-gray-100" : ""}
                                    ${!isLastRow ? "md:border-b" : ""}
                                `}
                            >
                                <div className="flex items-start gap-4">
                                    <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-400">
                                        <Icon className="w-5 h-5" strokeWidth={1.5} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-medium text-gray-900">
                                            {feature.title}
                                        </h3>
                                        <p className="mt-1 text-sm text-gray-500 leading-relaxed">
                                            {feature.description}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};
