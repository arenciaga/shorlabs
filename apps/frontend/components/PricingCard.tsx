"use client";

import { Check } from "lucide-react";

interface PricingCardProps {
    name: string;
    description: string;
    price: string;
    period?: string;
    features: string[];
    highlighted?: boolean;
    buttonText?: string;
    onButtonClick?: () => void;
    className?: string;
}

const PricingCard = ({
    name,
    description,
    price,
    period,
    features,
    highlighted = false,
    buttonText,
    onButtonClick,
    className,
}: PricingCardProps) => {
    const isCurrentPlan = buttonText === "Current plan";

    return (
        <div
            className={`relative flex flex-col h-full rounded-xl border border-zinc-200 bg-white px-6 py-6 ${className ?? ""}`}
        >
            {/* Plan Name */}
            <h3 className="text-lg font-semibold text-zinc-900">{name}</h3>

            {/* Price */}
            <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-semibold text-zinc-900">
                    {price}
                </span>
                {period && (
                    <span className="text-sm font-normal text-zinc-400">
                        {period}
                    </span>
                )}
            </div>

            {/* Description */}
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">{description}</p>

            {/* CTA Button */}
            {buttonText && (
                <button
                    onClick={isCurrentPlan ? undefined : onButtonClick}
                    disabled={isCurrentPlan}
                    className={`mt-5 w-full rounded-full py-2.5 px-4 text-[13px] font-medium transition-all cursor-pointer
                        ${highlighted && !isCurrentPlan
                            ? 'bg-zinc-900 text-white hover:bg-zinc-800 active:bg-zinc-950'
                            : isCurrentPlan
                                ? 'bg-zinc-100 text-zinc-400 cursor-default'
                                : 'border border-zinc-200 text-zinc-700 hover:bg-zinc-50 active:bg-zinc-100'
                        }`}
                >
                    {buttonText}
                </button>
            )}

            {/* Divider */}
            <div className="mt-5 border-t border-zinc-100" />

            {/* Features */}
            <ul className="mt-5 space-y-3 flex-1">
                {features.map((feature) => (
                    <li
                        key={feature}
                        className="flex items-center gap-2.5 text-[13px] text-zinc-600"
                    >
                        <Check className="w-3.5 h-3.5 flex-shrink-0 text-zinc-400" strokeWidth={2.5} />
                        {feature}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export { PricingCard };
export type { PricingCardProps };
