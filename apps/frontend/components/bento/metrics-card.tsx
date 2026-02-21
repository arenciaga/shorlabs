"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"

interface ScrambleNumberProps {
  target: string
  label: string
  delay?: number
}

function ScrambleNumber({ target, label, delay = 0 }: ScrambleNumberProps) {
  const [display, setDisplay] = useState(target.replace(/[0-9]/g, "0"))

  useEffect(() => {
    const timeout = setTimeout(() => {
      let iterations = 0
      const maxIterations = 20

      const interval = setInterval(() => {
        if (iterations >= maxIterations) {
          setDisplay(target)
          clearInterval(interval)
          return
        }

        setDisplay(
          target
            .split("")
            .map((char, i) => {
              if (!/[0-9]/.test(char)) return char
              if (iterations > maxIterations - 5 && i < iterations - (maxIterations - 5)) return char
              return String(Math.floor(Math.random() * 10))
            })
            .join("")
        )
        iterations++
      }, 50)

      return () => clearInterval(interval)
    }, delay)

    return () => clearTimeout(timeout)
  }, [target, delay])

  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-4xl lg:text-5xl font-mono font-bold tracking-tight text-foreground"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {display}
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
        <ScrambleNumber target="592,843" label="Invocations" delay={500} />
        <ScrambleNumber target="3K/mo" label="Free Requests" delay={800} />
        <ScrambleNumber target="$0.60" label="Per 1M Requests" delay={1100} />
        <ScrambleNumber target="$0.035" label="Per 1K GB-S" delay={1400} />
      </div>
    </Card>
  )
}
