"use client";

import { Zap, Code, Globe, Terminal, Cpu, DollarSign } from "lucide-react";

const features = [
    {
        icon: Zap,
        title: "One-Click Deploy",
        description: "Connect GitHub and deploy instantly. No Docker, no YAML, no DevOps.",
        highlight: true,
    },
    {
        icon: Code,
        title: "Multi-Framework Support",
        description: "First-class support for Next.js, FastAPI, Flask and more across frontend and backend.",
        highlight: false,
    },
    {
        icon: Globe,
        title: "Bring Your Own Domain",
        description: "Connect your own domain in seconds.",
        highlight: false,
    },
    {
        icon: Terminal,
        title: "Real-time Logs",
        description: "Stream logs directly from your running functions. Debug in real-time.",
        highlight: true,
    },
    {
        icon: Cpu,
        title: "Flexible Compute",
        description: "Configure memory, timeout, and storage. Scale from hobby to production.",
        highlight: false,
    },
    {
        icon: DollarSign,
        title: "Pay Per Request",
        description: "Zero idle costs. You only pay when your code runs.",
        highlight: false,
    },
];

export const FeatureSection = () => {
    return (
        <section id="features" className="relative w-full bg-white">
            {/* Section Header */}
            <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-10 sm:pb-14">
                <div className="text-center sm:text-left max-w-xl mx-auto sm:mx-0">
                    <span className="text-xs font-medium tracking-wider text-gray-400 uppercase">
                        Features
                    </span>
                    <h2 className="mt-3 text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
                        Everything you need to ship
                    </h2>
                    <p className="mt-3 text-gray-500 leading-relaxed">
                        Focus on code. We handle the infrastructure.
                    </p>
                </div>
            </div>

            {/* Feature Grid */}
            <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
                {/* Mobile: Stack | Tablet: 2 cols | Desktop: 3 cols */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-3 lg:gap-px lg:bg-gray-100 lg:rounded-2xl lg:overflow-hidden lg:border lg:border-gray-100">
                    {features.map((feature) => {
                        const Icon = feature.icon;

                        return (
                            <div
                                key={feature.title}
                                className="
                                    group relative bg-white p-5 sm:p-6 lg:p-8
                                    rounded-xl sm:rounded-xl lg:rounded-none
                                    border border-gray-100 sm:border-gray-100 lg:border-0
                                    transition-colors duration-300 hover:bg-gray-50/50
                                "
                            >
                                {/* Icon */}
                                <div className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg bg-gray-50 text-gray-600 mb-4 transition-all duration-300 group-hover:bg-gray-100 group-hover:text-gray-900">
                                    <Icon className="w-5 h-5 sm:w-[18px] sm:h-[18px]" strokeWidth={1.5} />
                                </div>

                                {/* Content */}
                                <h3 className="text-base sm:text-sm font-medium text-gray-900 mb-1.5">
                                    {feature.title}
                                </h3>
                                <p className="text-sm text-gray-500 leading-relaxed">
                                    {feature.description}
                                </p>

                                {/* Subtle corner accent for highlighted items */}
                                {feature.highlight && (
                                    <div className="absolute top-4 right-4 sm:top-3 sm:right-3 w-1.5 h-1.5 rounded-full bg-gray-200 transition-colors duration-300 group-hover:bg-gray-400" />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};
