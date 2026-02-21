"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"

const CAPABILITIES = [
  { name: "GITHUB IMPORT", status: "READY", value: "OAuth" },
  { name: "DEPLOY LOGS", status: "LIVE", value: "Streaming" },
  { name: "CUSTOM DOMAINS", status: "READY", value: "SSL Auto" },
  { name: "RUNTIME CONFIG", status: "READY", value: "Per Project" },
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
    <Card className="flex flex-col h-full rounded-none border-0 bg-transparent py-0 shadow-none gap-0">
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
          <span className="text-[9px] tracking-[0.15em] uppercase text-muted-foreground">Capability</span>
          <span className="text-[9px] tracking-[0.15em] uppercase text-muted-foreground">Status</span>
          <span className="text-[9px] tracking-[0.15em] uppercase text-muted-foreground text-right">Mode</span>
        </div>
        {CAPABILITIES.map((capability) => (
          <div
            key={capability.name}
            className="grid grid-cols-3 gap-2 py-2 border-b border-border last:border-none"
          >
            <span className="text-[11px] sm:text-xs font-mono text-foreground truncate">{capability.name}</span>
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5"
                style={{
                  backgroundColor: capability.status === "LIVE" || capability.status === "READY" ? "currentColor" : "hsl(var(--muted-foreground))",
                }}
              />
              <span className="text-[11px] sm:text-xs font-mono text-muted-foreground">{capability.status}</span>
            </div>
            <span className="text-[11px] sm:text-xs font-mono text-foreground text-right">{capability.value}</span>
          </div>
        ))}
        <div className="mt-auto pt-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] tracking-[0.15em] uppercase text-muted-foreground">
              Service Health
            </span>
            <span className="text-[9px] font-mono text-foreground">100%</span>
          </div>
          <div className="h-2 w-full border border-foreground">
            <div className="h-full bg-foreground" style={{ width: "100%" }} />
          </div>
        </div>
      </div>
    </Card>
  )
}
