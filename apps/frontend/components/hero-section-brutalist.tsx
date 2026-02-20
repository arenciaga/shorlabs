"use client"

import { WorkflowDiagram } from "@/components/workflow-diagram"
import { ArrowRight } from "lucide-react"
import { useAuth } from "@clerk/nextjs"
import Link from "next/link"
import { GoogleSignInButton } from "@/components/GoogleSignInButton"

export function HeroSection() {
  const { isLoaded, isSignedIn } = useAuth()

  return (
    <section className="relative w-full px-4 pt-6 pb-10 sm:px-6 sm:pb-12 md:px-8 lg:px-12 lg:pt-8 lg:pb-16 xl:px-16">
      <div className="border-2 border-foreground">
        <div className="flex items-center justify-between gap-3 border-b-2 border-foreground px-3 py-2 sm:px-4">
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">
            {"// SECTION: HERO"}
          </span>
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">
            003
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="border-b-2 border-foreground lg:border-b-0 lg:border-r-2">
            <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
              <p className="mb-4 text-[10px] sm:text-xs font-mono tracking-[0.2em] uppercase text-muted-foreground">
                OPEN SOURCE FULL-STACK DEPLOYMENT
              </p>

              <h1 className="font-mono text-3xl leading-[0.95] sm:text-5xl lg:text-6xl xl:text-7xl font-bold uppercase tracking-tight">
                DEPLOY
                <br />
                BACKEND + FRONTEND
                <br />
                FROM ONE PLACE
              </h1>

              <p className="mt-5 max-w-xl text-xs sm:text-sm text-muted-foreground leading-relaxed font-mono">
                Ship full-stack apps without infra setup. Deploy globally, pay only when requests run, and monitor everything from one control surface.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-0 border-2 border-foreground text-[10px] sm:text-xs font-mono uppercase tracking-widest">
                <div className="border-r-2 border-b-2 border-foreground px-3 py-2">Cold Start: ~0ms</div>
                <div className="border-b-2 border-foreground px-3 py-2">Deploy: {"<1s"}</div>
                <div className="border-r-2 border-foreground px-3 py-2">Scale: Automatic</div>
                <div className="px-3 py-2">Pricing: Pay/Request</div>
              </div>

              <div className="mt-6 flex w-full max-w-xl flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {!isLoaded ? (
                  <div className="h-10 w-40 bg-muted animate-pulse" />
                ) : isSignedIn ? (
                  <Link href="/projects" className="w-full sm:w-auto">
                    <button className="group flex w-full sm:w-auto items-center gap-0 bg-foreground text-background text-xs sm:text-sm font-mono tracking-wider uppercase">
                      <span className="flex items-center justify-center w-10 h-10 bg-muted-foreground shrink-0">
                        <ArrowRight size={16} strokeWidth={2} className="text-background" />
                      </span>
                      <span className="px-4 sm:px-5 py-2.5 w-full sm:w-auto text-center">
                        Go to Projects
                      </span>
                    </button>
                  </Link>
                ) : (
                  <>
                    <Link href="/sign-in" className="w-full sm:w-auto">
                      <button className="group flex w-full sm:w-auto items-center gap-0 bg-foreground text-background text-xs sm:text-sm font-mono tracking-wider uppercase">
                        <span className="flex items-center justify-center w-10 h-10 bg-muted-foreground shrink-0">
                          <ArrowRight size={16} strokeWidth={2} className="text-background" />
                        </span>
                        <span className="px-4 sm:px-5 py-2.5 w-full sm:w-auto text-center">
                          Get Started
                        </span>
                      </button>
                    </Link>
                    <GoogleSignInButton
                      source="hero"
                      text="Continue With Google"
                      className="w-full sm:w-auto text-[11px] sm:text-xs font-mono tracking-widest uppercase border border-foreground px-4 py-2.5 hover:bg-muted transition-colors rounded-none"
                    />
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col">
            <div className="border-b-2 border-foreground px-3 py-2 sm:px-4">
              <p className="text-[10px] sm:text-xs font-mono tracking-[0.2em] uppercase text-muted-foreground">
                WORKFLOW PIPELINE
              </p>
            </div>
            <div className="px-3 py-4 sm:px-5 sm:py-6 lg:px-6 lg:py-8">
              <WorkflowDiagram />
            </div>
            <div className="mt-auto border-t-2 border-foreground px-3 py-2 sm:px-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono tracking-[0.15em] uppercase text-muted-foreground">
                <span>CONNECT</span>
                <span>CONFIGURE</span>
                <span>DEPLOY</span>
                <span>MONITOR</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
