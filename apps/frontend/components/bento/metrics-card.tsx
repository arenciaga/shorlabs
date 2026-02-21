"use client"

import { Card } from "@/components/ui/card"

interface ScrambleNumberProps {
  target: string
  label: string
}

function ScrambleNumber({ target, label }: ScrambleNumberProps) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-4xl lg:text-5xl font-mono font-bold tracking-tight text-foreground"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {target}
      </span>
      <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

export function MetricsCard() {
  return (
    <Card className="flex flex-col h-full rounded-none border-0 bg-transparent py-0 shadow-none gap-0">
      <div className="flex items-center justify-between border-b-2 border-foreground px-4 py-2">
        <span className="text-[10px] tracking-widest text-muted-foreground uppercase">
          deployment.metrics
        </span>
        <span className="inline-block h-2 w-2 bg-muted-foreground" />
      </div>
      <div className="flex-1 flex flex-col justify-center gap-5 sm:gap-6 p-4 sm:p-6">
        <ScrambleNumber target="592,843" label="Invocations" />
        <ScrambleNumber target="3K/mo" label="Free Requests" />
        <ScrambleNumber target="$0.60" label="Per 1M Requests" />
        <ScrambleNumber target="$0.035" label="Per 1K GB-S" />
      </div>
    </Card>
  )
}
