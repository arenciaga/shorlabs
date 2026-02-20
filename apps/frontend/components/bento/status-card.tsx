"use client"

import { useEffect, useState } from "react"

const REGIONS = [
  { name: "US-EAST-1", status: "ONLINE", latency: "12ms" },
  { name: "EU-WEST-1", status: "ONLINE", latency: "15ms" },
  { name: "AP-SOUTH-1", status: "ONLINE", latency: "18ms" },
  { name: "US-WEST-2", status: "ONLINE", latency: "14ms" },
]

export function StatusCard() {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b-2 border-foreground px-3 sm:px-4 py-2">
        <span className="text-[10px] tracking-widest text-muted-foreground uppercase">
          edge_nodes.status
        </span>
        <span className="text-[10px] tracking-widest text-muted-foreground">
          {`TICK:${String(tick).padStart(4, "0")}`}
        </span>
      </div>
      <div className="flex-1 flex flex-col p-3 sm:p-4 gap-0">
        <div className="grid grid-cols-3 gap-2 border-b border-border pb-2 mb-2">
          <span className="text-[9px] tracking-[0.15em] uppercase text-muted-foreground">Region</span>
          <span className="text-[9px] tracking-[0.15em] uppercase text-muted-foreground">Status</span>
          <span className="text-[9px] tracking-[0.15em] uppercase text-muted-foreground text-right">Latency</span>
        </div>
        {REGIONS.map((region) => (
          <div
            key={region.name}
            className="grid grid-cols-3 gap-2 py-2 border-b border-border last:border-none"
          >
            <span className="text-[11px] sm:text-xs font-mono text-foreground truncate">{region.name}</span>
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5"
                style={{
                  backgroundColor: region.status === "ONLINE" ? "currentColor" : "hsl(var(--muted-foreground))",
                }}
              />
              <span className="text-[11px] sm:text-xs font-mono text-muted-foreground">{region.status}</span>
            </div>
            <span className="text-[11px] sm:text-xs font-mono text-foreground text-right">{region.latency}</span>
          </div>
        ))}
        <div className="mt-auto pt-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] tracking-[0.15em] uppercase text-muted-foreground">
              Global Throughput
            </span>
            <span className="text-[9px] font-mono text-foreground">100%</span>
          </div>
          <div className="h-2 w-full border border-foreground">
            <div className="h-full bg-foreground" style={{ width: "100%" }} />
          </div>
        </div>
      </div>
    </div>
  )
}
