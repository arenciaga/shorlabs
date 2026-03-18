"use client"
import { ArrowRight } from "lucide-react"
import { useAuth } from "@clerk/nextjs"
import Link from "next/link"
import { useEffect, useRef } from "react"
import { GoogleSignInButton } from "@/components/GoogleSignInButton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export function HeroSection() {
  const { isLoaded, isSignedIn } = useAuth()
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const startTime = 0
    const endTime = 43

    const handleTimeUpdate = () => {
      if (video.currentTime >= endTime) {
        video.currentTime = startTime
      }
    }

    const handleLoadedMetadata = () => {
      video.currentTime = startTime
      video.play()
    }

    if (video.readyState >= 1) {
      video.currentTime = startTime
      video.play()
    } else {
      video.addEventListener("loadedmetadata", handleLoadedMetadata, { once: true })
    }

    video.addEventListener("timeupdate", handleTimeUpdate)

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate)
      video.removeEventListener("loadedmetadata", handleLoadedMetadata)
    }
  }, [])
  return (
    <section className="relative w-full px-4 pt-6 pb-10 sm:px-6 sm:pt-8 sm:pb-12 md:px-8 lg:px-12 lg:pt-10 lg:pb-16 xl:px-16">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col items-start text-left">
          <Badge variant="outline" className="mb-6 rounded-none font-mono text-[10px] tracking-[0.2em]">
            Push to Deploy
          </Badge>
          <h1
            className="font-mono sm:text-xl lg:text-2xl xl:text-4xl tracking-tight text-foreground mb-5 font-bold uppercase leading-[0.95]"
            style={{ letterSpacing: "-0.01em" }}
          >
           Ship Backends Like You Ship Frontends.
          </h1>
          <p className="text-xs sm:text-base text-muted-foreground max-w-2xl mb-8 sm:mb-9 leading-relaxed font-mono px-0">
            Vercel for your backend. Push to GitHub — we build, containerize, and deploy your Go, Python, Node.js, or any Dockerized service. No ECS pipelines. No YAML. Production in seconds.
          </p>
          <div className="flex w-full max-w-md flex-col sm:flex-row items-stretch sm:items-center justify-start gap-3">
            {!isLoaded ? (
              <div className="h-10 w-40 bg-muted" />
            ) : isSignedIn ? (
              <Link href="/projects" className="w-full sm:w-auto">
                <Button className="group w-full sm:w-auto rounded-none bg-foreground text-background hover:bg-foreground text-xs sm:text-sm font-mono tracking-wider uppercase h-10 px-6">
                  <span>Go to Projects</span>
                  <ArrowRight className="w-4 h-4 ml-2" strokeWidth={1.5} />
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/sign-in" className="w-full sm:w-auto">
                  <Button className="group w-full sm:w-auto rounded-none bg-foreground text-background hover:bg-foreground text-xs sm:text-sm font-mono tracking-wider uppercase h-10 px-6">
                    <span>Get Started</span>
                    <ArrowRight className="w-4 h-4 ml-2" strokeWidth={1.5} />
                  </Button>
                </Link>
                <GoogleSignInButton
                  source="hero"
                  text="Continue With Google"
                  className="w-full sm:w-auto text-[11px] sm:text-xs font-mono tracking-widest uppercase border border-foreground px-4 py-2.5 hover:bg-muted rounded-none"
                />
              </>
            )}
          </div>
          <Card className="w-full max-w-5xl mt-8 sm:mt-10 lg:mt-12 rounded-none border-2 border-foreground bg-transparent py-0 px-0 shadow-none gap-0 overflow-hidden">
            <video
              ref={videoRef}
              className="w-full h-auto block"
              controls
              muted
              playsInline
              preload="metadata"
            >
              <source src="/demoo.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </Card>
        </div>
      </div>
    </section>
  )
}
