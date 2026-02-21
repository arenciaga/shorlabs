"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { useAuth } from "@clerk/nextjs"
import { ArrowRight, Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { Plan } from "@/lib/plans"
import { cn } from "@/lib/utils"
import { ScramblePrice } from "@/components/pricing-scramble-price"

interface PricingCardProps {
    plan: Plan
    index?: number
    highlighted?: boolean
    renderBadge?: (plan: Plan) => ReactNode
    renderAction?: (plan: Plan) => ReactNode
    hideDefaultAction?: boolean
    className?: string
}

export function PricingCard({
    plan,
    index,
    highlighted,
    renderBadge,
    renderAction,
    hideDefaultAction,
    className,
}: PricingCardProps) {
    const { isSignedIn } = useAuth()
    const isHighlighted = highlighted ?? plan.highlighted ?? false
    const customAction = renderAction?.(plan)
    const showDefaultAction = !hideDefaultAction && customAction == null

    return (
        <Card
            className={cn(
                "flex h-full flex-col gap-0 rounded-none border-2 py-0 shadow-none",
                isHighlighted
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground bg-background text-foreground",
                className
            )}
        >
            <div
                className={cn(
                    "flex items-center justify-between border-b-2 px-5 py-3",
                    isHighlighted ? "border-background/20" : "border-foreground"
                )}
            >
                <span className="text-[10px] font-mono tracking-[0.2em] uppercase">
                    {plan.name.toUpperCase()}
                </span>
                <div className="flex items-center gap-2">
                    {renderBadge?.(plan)}
                    {typeof index === "number" && (
                        <span className="text-[10px] font-mono tracking-[0.2em] opacity-50">
                            {String(index + 1).padStart(2, "0")}
                        </span>
                    )}
                </div>
            </div>

            <div className="px-5 pt-6 pb-4">
                <div className="flex items-baseline gap-1">
                    <span className="text-3xl lg:text-4xl">
                        <ScramblePrice target={plan.price.replace("$", "")} />
                    </span>
                    {plan.period && (
                        <span
                            className={cn(
                                "text-xs font-mono tracking-widest uppercase",
                                isHighlighted ? "text-background/50" : "text-muted-foreground"
                            )}
                        >
                            {plan.period}
                        </span>
                    )}
                </div>
                <p
                    className={cn(
                        "mt-3 text-xs font-mono leading-relaxed",
                        isHighlighted ? "text-background/60" : "text-muted-foreground"
                    )}
                >
                    {plan.description}
                </p>
            </div>

            <div
                className={cn(
                    "flex-1 border-t-2 px-5 py-4",
                    isHighlighted ? "border-background/20" : "border-foreground"
                )}
            >
                <div className="flex flex-col gap-3">
                    {plan.features.map((feature) => (
                        <div key={feature.label} className="flex items-start gap-3">
                            <Check size={12} strokeWidth={2.5} className="mt-0.5 shrink-0 text-muted-foreground" />
                            <span className="text-xs font-mono leading-relaxed">{feature.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="px-5 pt-3 pb-5">
                {customAction}
                {showDefaultAction && (
                    <Link href={isSignedIn ? "/projects" : "/sign-in"} className="w-full">
                        <Button
                            className={cn(
                                "group h-9 w-full rounded-none px-6 text-xs font-mono tracking-wider uppercase",
                                isHighlighted
                                    ? "bg-background text-foreground hover:bg-background"
                                    : "bg-foreground text-background hover:bg-foreground"
                            )}
                        >
                            <span>{isSignedIn ? "Deploy Now" : "Get Started"}</span>
                            <ArrowRight className="w-4 h-4 ml-2" strokeWidth={1.5} />
                        </Button>
                    </Link>
                )}
            </div>
        </Card>
    )
}
