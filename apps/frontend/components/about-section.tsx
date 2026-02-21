"use client"

import { useEffect, useState, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"

/* ── scramble text reveal ── */
function ScrambleText({ text, className }: { text: string; className?: string }) {
  const [display, setDisplay] = useState(text)
  const ref = useRef<HTMLSpanElement>(null)
  const [inView, setInView] = useState(false)
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_./:"

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
        }
      },
      { threshold: 0.1 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!inView) return
    let iteration = 0
    const interval = setInterval(() => {
      setDisplay(
        text
          .split("")
          .map((char, i) => {
            if (char === " ") return " "
            if (i < iteration) return text[i]
            return chars[Math.floor(Math.random() * chars.length)]
          })
          .join("")
      )
      iteration += 0.5
      if (iteration >= text.length) {
        setDisplay(text)
        clearInterval(interval)
      }
    }, 30)
    return () => clearInterval(interval)
  }, [inView, text])

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  )
}

/* ── blinking cursor ── */
function BlinkDot() {
  return <span className="inline-block h-2 w-2 bg-muted-foreground animate-blink" />
}

/* ── live uptime counter ── */
function UptimeCounter() {
  const [seconds, setSeconds] = useState(() => 31536000 + Math.floor(Math.random() * 1000000))

  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const format = (n: number) => {
    const d = Math.floor(n / 86400)
    const h = Math.floor((n % 86400) / 3600)
    const m = Math.floor((n % 3600) / 60)
    const s = n % 60
    return `${d}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`
  }

  return (
    <span className="font-mono text-muted-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
      {format(seconds)}
    </span>
  )
}

/* ── stat block ── */
const STATS = [
  { label: "PROJECTS_DEPLOYED", value: "1.2K+" },
  { label: "EDGE_REGIONS", value: "Global" },
  { label: "REQUESTS_HANDLED", value: "50M+" },
  { label: "AVG_DEPLOY_TIME", value: "<1s" },
]

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-1 border-2 border-foreground rounded-none bg-transparent py-3 px-3 sm:px-4 shadow-none">
      <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">
        {label}
      </span>
      <span className="text-xl lg:text-2xl font-mono font-bold tracking-tight">
        <ScrambleText text={value} />
      </span>
    </Card>
  )
}

/* ── main about section ── */
export function AboutSection() {
  return (
    <section className="w-full px-4 py-14 sm:px-6 sm:py-16 lg:px-12 lg:py-20">
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono whitespace-nowrap">
            {"// SECTION: ABOUT_SHORLABS"}
          </span>
          <Separator className="flex-1" />
          <BlinkDot />
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono whitespace-nowrap">
            005
          </span>
        </div>

        <Card className="flex flex-col lg:flex-row gap-0 border-2 border-foreground rounded-none bg-transparent py-0 shadow-none overflow-hidden">
          <div className="relative w-full lg:w-1/2 min-h-[240px] sm:min-h-[300px] lg:min-h-[500px] border-b-2 lg:border-b-0 lg:border-r-2 border-foreground overflow-hidden bg-foreground">
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between gap-2 px-3 sm:px-4 py-2 bg-foreground/80 backdrop-blur-sm">
              <span className="text-[10px] tracking-[0.2em] uppercase text-background/60 font-mono truncate">
                RENDER: deployment_infrastructure.obj
              </span>
              <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono shrink-0">
                LIVE
              </span>
            </div>

            <div className="w-full h-full bg-muted flex items-center justify-center">
              <span className="text-background/40 font-mono text-[10px] sm:text-xs px-3 text-center">DEPLOYMENT INFRASTRUCTURE</span>
            </div>

            <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-3 sm:px-4 py-2 bg-foreground/80 backdrop-blur-sm">
              <span className="text-[10px] tracking-[0.2em] uppercase text-background/40 font-mono truncate">
                {"CAM: -45deg / ISO"}
              </span>
              <span className="text-[10px] tracking-[0.2em] uppercase text-background/40 font-mono shrink-0">
                {"RES: 2048x2048"}
              </span>
            </div>
          </div>

          <div className="flex flex-col w-full lg:w-1/2">
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b-2 border-foreground">
              <Badge variant="outline" className="rounded-none text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono border-foreground/30">
                MANIFEST.md
              </Badge>
              <Badge variant="outline" className="rounded-none text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono border-foreground/30">
                v1.0.0
              </Badge>
            </div>

            <div className="flex-1 flex flex-col justify-between px-4 sm:px-5 py-6 lg:py-8">
              <div className="flex flex-col gap-6">
                <h2 className="text-xl sm:text-2xl lg:text-3xl font-mono font-bold tracking-tight uppercase text-balance">
                  Infrastructure built for
                  <br />
                  <span className="text-muted-foreground">rapid deployment</span>
                </h2>

                <div className="flex flex-col gap-4">
                  <p className="text-xs sm:text-sm font-mono text-muted-foreground leading-relaxed">
                    Deploy your frontend and backend from one place. Serverless, so you only pay when your code runs.
                    No infrastructure to manage, no complexity to handle.
                  </p>
                  <p className="text-xs sm:text-sm font-mono text-muted-foreground leading-relaxed">
                    Built by developers who understand the pain of deployment. We believe deployment should be simple,
                    fast, and transparent.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 py-3 border-t-2 border-b-2 border-foreground">
                  <span className="h-1.5 w-1.5 bg-muted-foreground" />
                  <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">
                    UPTIME:
                  </span>
                  <UptimeCounter />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 mt-6">
                {STATS.map((stat) => (
                  <StatBlock key={stat.label} {...stat} />
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  )
}
