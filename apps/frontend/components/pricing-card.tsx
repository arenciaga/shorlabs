import type { ReactNode } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Plan } from '@/lib/plans'
import { cn } from '@/lib/utils'

interface PricingCardProps {
    plan: Plan
    renderBadge?: (plan: Plan) => ReactNode
    renderAction?: (plan: Plan) => ReactNode
    highlighted?: boolean
    className?: string
}

export function PricingCard({ plan, renderBadge, renderAction, highlighted, className }: PricingCardProps) {
    return (
        <Card
            className={cn(
                "h-full rounded-2xl border-zinc-200 bg-white shadow-none",
                highlighted && "border-zinc-400 ring-1 ring-zinc-400",
                className,
            )}
        >
            <CardHeader className="space-y-3 px-4 pb-2">
                <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg font-semibold tracking-tight text-zinc-900">
                        {plan.name}
                    </CardTitle>
                    {renderBadge?.(plan)}
                </div>

                <div className="flex items-end gap-1">
                    <span className="text-2xl font-semibold leading-none text-zinc-900 sm:text-3xl">
                        {plan.price}
                    </span>
                    <span className="pb-0.5 text-xs text-zinc-500">{plan.period}</span>
                </div>

                <CardDescription className="text-xs leading-relaxed text-zinc-600">
                    {plan.description}
                </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col px-4 pt-0">
                {renderAction?.(plan)}

                <ul className={cn("space-y-2", renderAction && "mt-4")}>
                    {plan.features.map((feature) => {
                        const Icon = feature.icon
                        return (
                            <li
                                key={feature.label}
                                className="flex items-center gap-2 text-xs text-zinc-600"
                            >
                                <Icon className="size-3.5 shrink-0 text-zinc-400" strokeWidth={2} />
                                {feature.label}
                            </li>
                        )
                    })}
                </ul>
            </CardContent>
        </Card>
    )
}
