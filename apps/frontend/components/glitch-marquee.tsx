"use client"

import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

const FRAMEWORKS = [
  "NEXT.JS",
  "REACT",
  "FASTAPI",
  "EXPRESS",
  "FLASK",
  "DJANGO",
  "VUE",
  "SVELTE",
]

function LogoBlock({ name, glitch }: { name: string; glitch: boolean }) {
  return (
    <div
      className={`flex items-center justify-center px-5 sm:px-8 py-3 sm:py-4 border-r-2 border-foreground shrink-0 ${
        glitch ? "animate-glitch" : ""
      }`}
    >
      <span className="text-xs sm:text-sm font-mono tracking-[0.15em] uppercase text-foreground whitespace-nowrap">
        {name}
      </span>
    </div>
  )
}

export function GlitchMarquee() {
  const glitchIndices = [2, 6]

  return (
    <section className="w-full py-12 px-4 sm:px-6 sm:py-14 lg:px-12 lg:py-16">
      <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground whitespace-nowrap">
          {"// FRAMEWORKS: SUPPORTED"}
        </span>
        <Separator className="flex-1" />
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground whitespace-nowrap">008</span>
      </div>

      <Card className="overflow-hidden border-2 border-foreground rounded-none bg-transparent py-0 shadow-none gap-0">
        <div className="flex animate-marquee motion-reduce:animate-none" style={{ width: "max-content" }}>
          {[...FRAMEWORKS, ...FRAMEWORKS].map((name, i) => (
            <LogoBlock
              key={`${name}-${i}`}
              name={name}
              glitch={glitchIndices.includes(i % FRAMEWORKS.length)}
            />
          ))}
        </div>
      </Card>
    </section>
  )
}
