"use client"

import { TerminalCard } from "@/components/bento/terminal-card"
import { DitherCard } from "@/components/bento/dither-card"
import { MetricsCard } from "@/components/bento/metrics-card"
import { StatusCard } from "@/components/bento/status-card"

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
}

export function FeatureGrid() {
  return (
    <section className="w-full px-6 py-20 lg:px-12">
      {/* Section label */}
      <div className="flex items-center gap-4 mb-8">
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
          {"// SECTION: FEATURES"}
        </span>
        <div className="flex-1 border-t border-border" />
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">004</span>
      </div>

      {/* 2x2 Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 border-2 border-foreground">
        {/* Terminal */}
        <div className="border-b-2 md:border-b-0 md:border-r-2 border-foreground min-h-[280px]">
          <TerminalCard />
        </div>

        {/* Dither */}
        <div className="border-b-2 md:border-b-0 border-foreground min-h-[280px]">
          <DitherCard />
        </div>

        {/* Metrics */}
        <div className="border-t-2 md:border-r-2 border-foreground min-h-[280px]">
          <MetricsCard />
        </div>

        {/* Status */}
        <div className="border-t-2 border-foreground min-h-[280px]">
          <StatusCard />
        </div>
      </div>
    </section>
  )
}
