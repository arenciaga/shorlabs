"use client"

import { PLANS } from "@/lib/plans"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { PricingCard } from "@/components/pricing-card"

/* ── status line ── */
function StatusLine() {
  return (
    <div className="flex items-center gap-2 text-[10px] tracking-widest text-muted-foreground uppercase font-mono whitespace-nowrap">
      <span className="h-1.5 w-1.5 bg-muted-foreground" />
      <span>invocations served: 592,843</span>
    </div>
  )
}

/* ── blinking cursor indicator ── */
function BlinkDot() {
  return <span className="inline-block h-2 w-2 bg-muted-foreground" />
}

/* ── main pricing section ── */
export function PricingSection() {
  return (
    <section id="pricing" className="w-full px-4 py-14 sm:px-6 sm:py-16 lg:px-12 lg:py-20">
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono whitespace-nowrap">
            {"// SECTION: PRICING_TIERS"}
          </span>
          <Separator className="flex-1" />
          <BlinkDot />
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono whitespace-nowrap">
            006
          </span>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 sm:gap-6 mb-8 sm:mb-12">
          <div className="flex flex-col gap-3">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-mono font-bold tracking-tight uppercase text-foreground text-balance">
              Select your plan
            </h2>
            <p className="text-xs sm:text-sm font-mono text-muted-foreground leading-relaxed max-w-md">
              Usage-based pricing with a free Hobby tier. Upgrade only when you need more limits.
            </p>
          </div>
          <Badge variant="outline" className="rounded-none font-mono text-[10px] tracking-widest uppercase w-full sm:w-auto justify-start sm:justify-center overflow-x-auto">
            <StatusLine />
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-0">
          {PLANS.map((plan, i) => (
            <PricingCard key={plan.id} plan={plan} index={i} />
          ))}
        </div>

        <div className="flex items-center gap-3 mt-6">
          <Badge variant="outline" className="rounded-none font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground leading-relaxed">
            {"* Includes free usage. Cancel anytime."}
          </Badge>
          <Separator className="flex-1" />
        </div>
      </div>
    </section>
  )
}
