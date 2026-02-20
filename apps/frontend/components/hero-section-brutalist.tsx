"use client"

import { WorkflowDiagram } from "@/components/workflow-diagram"
import { ArrowRight } from "lucide-react"
import { useAuth } from "@clerk/nextjs"
import Link from "next/link"
import { GoogleSignInButton } from "@/components/GoogleSignInButton"

const ease = [0.22, 1, 0.36, 1] as const

export function HeroSection() {
  const { isLoaded, isSignedIn } = useAuth()

  return (
    <section className="relative w-full px-12 pt-6 pb-12 lg:px-24 lg:pt-10 lg:pb-16">
      <div className="flex flex-col items-center text-center">
        {/* Top headline */}
        <h1
          className="font-mono text-4xl sm:text-6xl lg:text-7xl xl:text-8xl tracking-tight text-foreground mb-2 select-none font-bold uppercase"
          style={{
            letterSpacing: "-0.02em",
          }}
        >
          DEPLOY. SCALE.
        </h1>

        {/* Central Workflow Diagram */}
        <div className="w-full max-w-2xl my-4 lg:my-6">
          <WorkflowDiagram />
        </div>

        {/* Bottom headline */}
        <h1
          className="font-mono text-4xl sm:text-6xl lg:text-7xl xl:text-8xl tracking-tight text-foreground mb-4 select-none font-bold uppercase"
          aria-hidden="true"
          style={{
            letterSpacing: "-0.02em",
          }}
        >
          ROUTE.
        </h1>

        {/* Sub-headline */}
        <p className="text-xs lg:text-sm text-muted-foreground max-w-md mb-6 leading-relaxed font-mono">
          Open Source Full-Stack Deployment Platform. Deploy your frontend and backend from one place. Serverless, so you only pay when your code runs.
        </p>

        {/* CTA Button */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {!isLoaded ? (
            <div className="h-10 w-32 bg-muted animate-pulse" />
          ) : isSignedIn ? (
            <Link href="/projects">
              <button className="group flex items-center gap-0 bg-foreground text-background text-sm font-mono tracking-wider uppercase">
                <span className="flex items-center justify-center w-10 h-10 bg-muted-foreground">
                  <ArrowRight size={16} strokeWidth={2} className="text-background" />
                </span>
                <span className="px-5 py-2.5">
                  Go to Projects
                </span>
              </button>
            </Link>
          ) : (
            <>
              <Link href="/sign-in">
                <button className="group flex items-center gap-0 bg-foreground text-background text-sm font-mono tracking-wider uppercase">
                  <span className="flex items-center justify-center w-10 h-10 bg-muted-foreground">
                    <ArrowRight size={16} strokeWidth={2} className="text-background" />
                  </span>
                  <span className="px-5 py-2.5">
                    Get Started
                  </span>
                </button>
              </Link>
              <GoogleSignInButton
                source="hero"
                text="Continue With Google"
                className="text-xs font-mono tracking-widest uppercase border border-foreground px-4 py-2.5 hover:bg-muted transition-colors"
              />
            </>
          )}
        </div>
      </div>
    </section>
  )
}
