"use client"

import { TerminalCard } from "@/components/bento/terminal-card"
import { DitherCard } from "@/components/bento/dither-card"
import { MetricsCard } from "@/components/bento/metrics-card"
import { StatusCard } from "@/components/bento/status-card"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export function FeatureGrid() {
  return (
    <section id="features" className="w-full px-4 py-14 sm:px-6 sm:py-16 lg:px-12 lg:py-20">
      <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground whitespace-nowrap">
          {"// SECTION: FEATURES"}
        </span>
        <Separator className="flex-1" />
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground whitespace-nowrap">004</span>
      </div>

      <Card className="grid grid-cols-1 md:grid-cols-2 border-2 border-foreground rounded-none bg-transparent py-0 shadow-none gap-0">
        <div className="border-b-2 border-foreground md:border-r-2 min-h-[240px] sm:min-h-[280px]">
          <TerminalCard />
        </div>

        <div className="border-b-2 border-foreground min-h-[240px] sm:min-h-[280px]">
          <DitherCard />
        </div>

        <div className="border-b-2 md:border-b-0 md:border-r-2 border-foreground min-h-[240px] sm:min-h-[280px]">
          <MetricsCard />
        </div>

        <div className="min-h-[240px] sm:min-h-[280px]">
          <StatusCard />
        </div>
      </Card>
    </section>
  )
}
