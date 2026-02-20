"use client"

import { useEffect, useState } from "react"
import { ArrowRight, Check, Minus } from "lucide-react"
import { PLANS } from "@/lib/plans"
import Link from "next/link"
import { useAuth } from "@clerk/nextjs"

const ease = [0.22, 1, 0.36, 1] as const

/* ── scramble-in price effect ── */
function ScramblePrice({ target, prefix = "$" }: { target: string; prefix?: string }) {
  const [display, setDisplay] = useState(target.replace(/[0-9]/g, "0"))

  useEffect(() => {
    let iterations = 0
    const maxIterations = 18
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
  }, [target])

  return (
    <span className="font-mono font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>
      {prefix}{display}
    </span>
  )
}

/* ── data-stream status line ── */
function StatusLine() {
  const [throughput, setThroughput] = useState("0.0")

  useEffect(() => {
    const interval = setInterval(() => {
      setThroughput((Math.random() * 50 + 10).toFixed(1))
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-center gap-2 text-[10px] tracking-widest text-muted-foreground uppercase font-mono">
      <span className="h-1.5 w-1.5 bg-muted-foreground" />
      <span>live deployments: {throughput}k / day</span>
    </div>
  )
}

/* ── blinking cursor indicator ── */
function BlinkDot() {
  return <span className="inline-block h-2 w-2 bg-muted-foreground animate-blink" />
}

/* ── single pricing card ── */
function PricingCard({ plan, index }: { plan: typeof PLANS[0]; index: number }) {
  const { isSignedIn } = useAuth()
  const isHighlighted = plan.highlighted || false

  return (
    <div
      className={`flex flex-col h-full ${
        isHighlighted
          ? "border-2 border-foreground bg-foreground text-background"
          : "border-2 border-foreground bg-background text-foreground"
      }`}
    >
      {/* Card header */}
      <div
        className={`flex items-center justify-between px-5 py-3 border-b-2 ${
          isHighlighted ? "border-background/20" : "border-foreground"
        }`}
      >
        <span className="text-[10px] tracking-[0.2em] uppercase font-mono">
          {plan.name.toUpperCase()}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] tracking-[0.2em] font-mono opacity-50">
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* Price block */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl lg:text-4xl">
            <ScramblePrice target={plan.price.replace("$", "")} />
          </span>
          {plan.period && (
            <span
              className={`text-xs font-mono tracking-widest uppercase ${
                isHighlighted ? "text-background/50" : "text-muted-foreground"
              }`}
            >
              {plan.period}
            </span>
          )}
        </div>
        <p
          className={`text-xs font-mono mt-3 leading-relaxed ${
            isHighlighted ? "text-background/60" : "text-muted-foreground"
          }`}
        >
          {plan.description}
        </p>
      </div>

      {/* Feature list */}
      <div
        className={`flex-1 px-5 py-4 border-t-2 ${
          isHighlighted ? "border-background/20" : "border-foreground"
        }`}
      >
        <div className="flex flex-col gap-3">
          {plan.features.map((feature, fi) => {
            const Icon = feature.icon
            return (
              <div key={feature.label} className="flex items-start gap-3">
                <Check
                  size={12}
                  strokeWidth={2.5}
                  className="mt-0.5 shrink-0 text-muted-foreground"
                />
                <span
                  className={`text-xs font-mono leading-relaxed ${
                    isHighlighted ? "" : ""
                  }`}
                >
                  {feature.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* CTA */}
      <div className="px-5 pb-5 pt-3">
        {isSignedIn ? (
          <Link href="/projects">
            <button
              className={`group w-full flex items-center justify-center gap-0 text-xs font-mono tracking-wider uppercase ${
                isHighlighted
                  ? "bg-background text-foreground"
                  : "bg-foreground text-background"
              }`}
            >
              <span className="flex items-center justify-center w-9 h-9 bg-muted-foreground">
                <ArrowRight size={14} strokeWidth={2} className="text-background" />
              </span>
              <span className="flex-1 py-2.5">Deploy Now</span>
            </button>
          </Link>
        ) : (
          <Link href="/sign-in">
            <button
              className={`group w-full flex items-center justify-center gap-0 text-xs font-mono tracking-wider uppercase ${
                isHighlighted
                  ? "bg-background text-foreground"
                  : "bg-foreground text-background"
              }`}
            >
              <span className="flex items-center justify-center w-9 h-9 bg-muted-foreground">
                <ArrowRight size={14} strokeWidth={2} className="text-background" />
              </span>
              <span className="flex-1 py-2.5">Get Started</span>
            </button>
          </Link>
        )}
      </div>
    </div>
  )
}

/* ── main pricing section ── */
export function PricingSection() {
  return (
    <section className="w-full px-6 py-20 lg:px-12">
      {/* Section label */}
      <div className="flex items-center gap-4 mb-8">
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">
          {"// SECTION: PRICING_TIERS"}
        </span>
        <div className="flex-1 border-t border-border" />
        <BlinkDot />
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">
          006
        </span>
      </div>

      {/* Section header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-12">
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl lg:text-3xl font-mono font-bold tracking-tight uppercase text-foreground text-balance">
            Select your plan
          </h2>
          <p className="text-xs lg:text-sm font-mono text-muted-foreground leading-relaxed max-w-md">
            Simple, transparent pricing. Start free, scale as you grow.
          </p>
        </div>
        <StatusLine />
      </div>

      {/* Pricing grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
        {PLANS.map((plan, i) => (
          <PricingCard key={plan.id} plan={plan} index={i} />
        ))}
      </div>

      {/* Bottom note */}
      <div className="flex items-center gap-3 mt-6">
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">
          {"* Pay per request pricing available. Cancel anytime."}
        </span>
        <div className="flex-1 border-t border-border" />
      </div>
    </section>
  )
}
