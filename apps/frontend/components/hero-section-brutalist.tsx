"use client"
import { ArrowRight } from "lucide-react"
import { useAuth } from "@clerk/nextjs"
import Link from "next/link"
import { GoogleSignInButton } from "@/components/GoogleSignInButton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
export function HeroSection() {
  const { isLoaded, isSignedIn } = useAuth()
  return (
    <section className="relative w-full px-4 pt-6 pb-10 sm:px-6 sm:pt-8 sm:pb-12 md:px-8 lg:px-12 lg:pt-10 lg:pb-16 xl:px-16">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col items-center text-center">
          <Badge variant="outline" className="mb-6 rounded-none font-mono text-[10px] tracking-[0.2em] uppercase">
            OPEN SOURCE
          </Badge>
          <h1
            className="font-mono sm:text-xl lg:text-base xl:text-4xl tracking-tight text-foreground mb-5 select-none font-bold uppercase leading-[0.95]"
            style={{ letterSpacing: "-0.01em" }}
          >
            FULL-STACK DEPLOYMENT PLATFORM
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl mb-8 sm:mb-9 leading-relaxed font-mono px-1 sm:px-0">
            Deploy full-stack apps from GitHub in minutes. Configure memory, timeout, environment variables, logs, and custom domains from one dashboard.
          </p>
          <div className="flex w-full max-w-md sm:max-w-none flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
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
              className="w-full h-auto block"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
            >
              <source src="/Shorlabs-Demo.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </Card>
        </div>
      </div>
    </section>
  )
}
