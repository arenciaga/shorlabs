"use client";

import { Check } from "lucide-react";
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from "@/components/ui/card";

const plans = [
    {
        name: "Hobby",
        description: "Perfect for personal projects and testing.",
        price: "$0",
        period: "",
        subtext: "Always free",
        features: [
            "1 Project",
            "1 GB Memory",
            "Up to 30 Second Timeout",
            "512 MB Storage",
            "1M Requests/Month",
            "100K GB-Seconds",
        ],
    },
    {
        name: "Pro",
        description: "Built for production workloads and commercial applications",
        price: "$20",
        period: "/month",
        subtext: "Only billed monthly",
        features: [
            "10 Projects",
            "Up to 4 GB Memory",
            "Up to 300 Second Timeout",
            "2 GB Storage",
            "10M Requests/Month",
            "1M GB-Seconds",
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    {plans.map((plan) => (
                        <div key={plan.name} className="dark">
                            <Card className="h-full border-gray-800">
                                <CardHeader>
                                    <CardTitle className="text-xl">
                                        {plan.name}
                                    </CardTitle>
                                </CardHeader>

                                <CardContent className="flex flex-col gap-6">
                                    {/* Price */}
                                    <div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-4xl sm:text-5xl font-medium">
                                                {plan.price}
                                            </span>
                                            {plan.period && (
                                                <span className="text-muted-foreground text-sm">
                                                    {plan.period}
                                                </span>
                                            )}
                                        </div>
                                        <CardDescription className="mt-2">
                                            {plan.subtext}
                                        </CardDescription>
                                    </div>

                                    {/* Description */}
                                    <p className="text-sm">
                                        {plan.description}
                                    </p>

                                    {/* Features */}
                                    <ul className="space-y-4 pt-2">
                                        {plan.features.map((feature) => (
                                            <li
                                                key={feature}
                                                className="flex items-center gap-3 text-sm text-muted-foreground"
                                            >
                                                <Check className="w-4 h-4 flex-shrink-0" />
                                                {feature}
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export { PricingSection };
