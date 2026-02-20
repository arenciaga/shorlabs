"use client"

import { WorkflowDiagram } from "@/components/workflow-diagram"
import { ArrowRight } from "lucide-react"
import { useAuth } from "@clerk/nextjs"
import Link from "next/link"
import { GoogleSignInButton } from "@/components/GoogleSignInButton"

export function HeroSection() {
  const { isLoaded, isSignedIn } = useAuth()

  return (
    <section className="relative w-full px-4 pt-6 pb-10 sm:px-6 sm:pb-12 md:px-8 lg:px-16 lg:pt-10 lg:pb-16 xl:px-24">
      <div className="flex flex-col items-center text-center">
        <h1
          className="font-mono text-3xl sm:text-5xl lg:text-7xl xl:text-8xl tracking-tight text-foreground mb-2 select-none font-bold uppercase"
          style={{
            letterSpacing: "-0.02em",
          }}
        >
          DEPLOY. SCALE.
        </h1>

        <div className="w-full max-w-4xl my-4 lg:my-6">
          <WorkflowDiagram />
        </div>

        <h1
          className="font-mono text-3xl sm:text-5xl lg:text-7xl xl:text-8xl tracking-tight text-foreground mb-4 select-none font-bold uppercase"
          aria-hidden="true"
          style={{
            letterSpacing: "-0.02em",
          }}
        >
          ROUTE.
        </h1>

        <p className="text-xs sm:text-sm text-muted-foreground max-w-[44rem] mb-6 leading-relaxed font-mono px-2 sm:px-0">
          Open Source Full-Stack Deployment Platform. Deploy your frontend and backend from one place. Serverless, so you only pay when your code runs.
        </p>

        <div className="flex w-full max-w-md sm:max-w-none flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
          {!isLoaded ? (
            <div className="h-10 w-32 bg-muted animate-pulse" />
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
    </section>
  )
}
