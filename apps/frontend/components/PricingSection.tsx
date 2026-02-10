"use client";

import { PricingCard } from "@/components/PricingCard";

const plans = [
    {
        name: "Hobby",
        description: "Perfect for personal projects and testing.",
        price: "$0",
        features: [
            "Unlimited Projects",
            "1 GB Memory",
            "Up to 30 Second Timeout",
            "512 MB Storage",
            "50K Requests/Month",
            "20K GB-Seconds",
        ],
    },
    {
        name: "Pro",
        description: "Built for production workloads and commercial applications.",
        price: "$20",
        period: "/ month",
        highlighted: true,
        features: [
            "Unlimited Projects",
            "Up to 4 GB Memory",
            "Up to 300 Second Timeout",
            "2 GB Storage",
            "1M Requests/Month",
            "400K GB-Seconds",
        ],
    },
];

const PricingSection = () => {
    return (
        <section id="pricing" className="relative w-full bg-white">
            {/* Top border */}
            <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
                <div className="border-t border-gray-100" />
            </div>

            {/* Section Header */}
            <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-10 sm:pb-14">
                <div className="text-center sm:text-left max-w-xl mx-auto sm:mx-0">
                    <span className="text-xs font-medium tracking-wider text-gray-400 uppercase">
                        Pricing
                    </span>
                    <h2 className="mt-3 text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
                        Simple, transparent pricing
                    </h2>
                    <p className="mt-3 text-gray-500 leading-relaxed">
                        Start free, scale as you grow. No surprises.
                    </p>
                </div>
            </div>

            {/* Pricing Cards */}
            <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {plans.map((plan) => (
                        <PricingCard key={plan.name} {...plan} />
                    ))}
                </div>
            </div>
        </section>
    );
};

export { PricingSection };
