"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Separator } from "@/components/ui/separator"

const STEPS = [
  {
    number: "01",
    title: "Connect your repo",
    description:
      "Link your GitHub account and import any repository. We auto-detect your framework and suggest the right settings.",
    start: 4,
    end: 7,
  },
  {
    number: "02",
    title: "Configure & deploy",
    description:
      "Set environment variables, pick your compute settings, and hit deploy. Your code is containerized and shipped automatically.",
    start: 8,
    end: 22,
  },
  {
    number: "03",
    title: "You're live",
    description:
      "Your app gets a production URL instantly. Add a custom domain, stream logs in real-time, and redeploy with every git push.",
    start: 103,
    end: 108,
  },
]

export function AboutSection() {
  const [activeStep, setActiveStep] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)

  const playSegment = useCallback((index: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = STEPS[index].start
    video.play()
  }, [])

  const handleStepClick = useCallback((index: number) => {
    setActiveStep(index)
    playSegment(index)
  }, [playSegment])

  // Loop within the active step's time range
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    function onTimeUpdate() {
      const step = STEPS[activeStep]
      if (video && video.currentTime >= step.end) {
        video.currentTime = step.start
      }
    }

    video.addEventListener("timeupdate", onTimeUpdate)
    return () => video.removeEventListener("timeupdate", onTimeUpdate)
  }, [activeStep])

  // Start first segment on mount
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    function onLoaded() {
      video!.currentTime = STEPS[0].start
      video!.play()
    }

    if (video.readyState >= 1) {
      onLoaded()
    } else {
      video.addEventListener("loadedmetadata", onLoaded, { once: true })
    }
  }, [])

  return (
    <section className="w-full px-4 py-14 sm:px-6 sm:py-16 lg:px-12 lg:py-20">
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono whitespace-nowrap">
            {"// SECTION: HOW_IT_WORKS"}
          </span>
          <Separator className="flex-1" />
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono whitespace-nowrap">
            005
          </span>
        </div>

        <div className="border-2 border-foreground grid grid-cols-1 md:grid-cols-2">
          {/* Steps */}
          <div className="flex flex-col border-b-2 md:border-b-0 md:border-r-2 border-foreground">
            {STEPS.map((step, i) => (
              <button
                key={step.number}
                type="button"
                onClick={() => handleStepClick(i)}
                className={[
                  "flex gap-3 sm:gap-4 p-4 sm:p-5 lg:p-6 text-left transition-colors cursor-pointer",
                  i < STEPS.length - 1 ? "border-b-2 border-foreground" : "",
                  activeStep === i ? "bg-foreground text-background" : "bg-transparent",
                ].join(" ")}
              >
                <span
                  className={[
                    "text-xl sm:text-2xl lg:text-3xl font-mono font-bold shrink-0",
                    activeStep === i ? "text-background" : "text-foreground/20",
                  ].join(" ")}
                >
                  {step.number}
                </span>
                <div className="flex flex-col gap-1 sm:gap-1.5">
                  <h3
                    className={[
                      "text-xs sm:text-sm lg:text-base font-mono font-bold tracking-tight uppercase",
                      activeStep === i ? "text-background" : "text-foreground",
                    ].join(" ")}
                  >
                    {step.title}
                  </h3>
                  <p
                    className={[
                      "text-[10px] sm:text-[11px] lg:text-xs font-mono leading-relaxed",
                      activeStep === i ? "text-background/70" : "text-muted-foreground",
                    ].join(" ")}
                  >
                    {step.description}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* Video */}
          <div className="relative bg-foreground flex items-center justify-center min-h-[200px] sm:min-h-[260px] md:min-h-0">
            <video
              ref={videoRef}
              className="w-full h-full object-cover absolute inset-0"
              muted
              playsInline
              preload="auto"
            >
              <source src="/Shorlabs-Demo.mp4" type="video/mp4" />
            </video>
          </div>
        </div>
      </div>
    </section>
  )
}
