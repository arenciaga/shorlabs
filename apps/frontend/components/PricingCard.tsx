"use client";

import { Check } from "lucide-react";
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from "@/components/ui/card";

interface PricingCardProps {
    name: string;
    description: string;
    price: string;
    period?: string;
    subtext: string;
    features: string[];
    className?: string;
}

const PricingCard = ({
    name,
    description,
    price,
    period,
    subtext,
    features,
    className,
}: PricingCardProps) => {
    return (
        <Card className={`h-full border-gray-200 ${className ?? ""}`}>
            <CardHeader>
                <CardTitle className="text-xl text-gray-900">{name}</CardTitle>
            </CardHeader>

            <CardContent className="flex flex-col gap-6">
                {/* Price */}
                <div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-4xl sm:text-5xl font-medium text-gray-900">
                            {price}
                        </span>
                        {period && (
                            <span className="text-muted-foreground text-sm">
                                {period}
                            </span>
                        )}
                    </div>
                    <CardDescription className="mt-2">
                        {subtext}
                    </CardDescription>
                </div>

                {/* Description */}
                <p className="text-sm text-gray-900">{description}</p>

                {/* Features */}
                <ul className="space-y-4 pt-2">
                    {features.map((feature) => (
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
    );
};

export { PricingCard };
export type { PricingCardProps };
