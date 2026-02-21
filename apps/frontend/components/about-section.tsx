"use client"

import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"

function ScrambleText({ text, className }: { text: string; className?: string }) {
  return <span className={className}>{text}</span>
}

function BlinkDot() {
  return <span className="inline-block h-2 w-2 bg-muted-foreground" />
}

function UptimeCounter() {
  return (
    <span className="font-mono text-muted-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
      365d 00h 00m 00s
    </span>
  )
}

/* ── stat block ── */
const STATS = [
  { label: "TOTAL_INVOCATIONS", value: "592,843" },
  { label: "HOBBY_INCLUDED", value: "3K REQ / 1.2K GB-S" },
  { label: "REQUEST_PRICING", value: "$0.60 / 1M" },
  { label: "FIRST_DEPLOY", value: "~60-90s" },
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

        <Card className="flex flex-col gap-0 border-2 border-foreground rounded-none bg-transparent py-0 shadow-none overflow-hidden">
          <div className="relative w-full min-h-[180px] sm:min-h-[220px] lg:min-h-[280px] border-b-2 border-foreground overflow-hidden bg-foreground">
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between gap-2 px-3 sm:px-4 py-2 bg-foreground/80 backdrop-blur-sm">
              <span className="text-[10px] tracking-[0.2em] uppercase text-background/60 font-mono truncate">
                RENDER: deployment_infrastructure.obj
              </span>
              <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono shrink-0">
                LIVE
              </span>
            </div>

            <video
              className="w-full h-full object-cover"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
            >
              <source src="/2.mp4" type="video/mp4" />
            </video>

            <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-3 sm:px-4 py-2 bg-foreground/80 backdrop-blur-sm">
              <span className="text-[10px] tracking-[0.2em] uppercase text-background/40 font-mono truncate">
                {"CAM: -45deg / ISO"}
              </span>
              <span className="text-[10px] tracking-[0.2em] uppercase text-background/40 font-mono shrink-0">
                {"RES: 2048x2048"}
              </span>
            </div>
          </div>

          <div className="flex flex-col w-full">
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
                  Deployment workflow built for
                  <br />
                  <span className="text-muted-foreground">fast iteration</span>
                </h2>

                <div className="flex flex-col gap-4">
                  <p className="text-xs sm:text-sm font-mono text-muted-foreground leading-relaxed">
                    Import a GitHub repository, review defaults, and deploy to a production URL from one place.
                    Built-in logs and project settings make redeploys straightforward.
                  </p>
                  <p className="text-xs sm:text-sm font-mono text-muted-foreground leading-relaxed">
                    Configure environment variables, start commands, compute limits, and domains per project.
                    Pay only for usage as your traffic grows.
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
