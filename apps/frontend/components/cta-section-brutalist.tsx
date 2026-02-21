"use client"

import { useAuth } from "@clerk/nextjs"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { GoogleSignInButton } from "@/components/GoogleSignInButton"
import { Button } from "@/components/ui/button"

const CtaSection = () => {
  const { isLoaded, isSignedIn } = useAuth()

  return (
    <section className="relative w-full bg-background">
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
        <div className="border-t-2 border-foreground" />
      </div>

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <div className="flex flex-col items-center text-center">
          <span className="text-[10px] font-mono tracking-[0.2em] uppercase mb-6 text-muted-foreground">
            Get Started
          </span>

          <h2 className="text-2xl sm:text-3xl md:text-4xl font-mono font-bold uppercase tracking-tight max-w-xl text-foreground leading-[0.95]">
            Start deploying in minutes.
          </h2>

          <p className="mt-4 text-muted-foreground max-w-md leading-relaxed text-xs sm:text-sm font-mono">
            Connect your repository and go live. No infrastructure to manage, no complexity to handle.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            {!isLoaded ? (
              <div className="h-10 w-full sm:w-auto bg-muted rounded-none border-2 border-foreground" style={{ minWidth: "186px" }} />
            ) : isSignedIn ? (
              <Link href="/projects" className="w-full sm:w-auto">
                <Button className="group w-full sm:w-auto rounded-none text-xs sm:text-sm bg-foreground text-background hover:bg-foreground px-6 h-10 font-mono tracking-wider uppercase">
                  <span>Go to Projects</span>
                  <ArrowRight className="w-4 h-4 ml-2" strokeWidth={1.5} />
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/sign-in" className="w-full sm:w-auto">
                  <Button className="group w-full sm:w-auto rounded-none text-xs sm:text-sm bg-foreground text-background hover:bg-foreground px-6 h-10 font-mono tracking-wider uppercase">
                    <span>Get Started</span>
                    <ArrowRight className="w-4 h-4 ml-2" strokeWidth={1.5} />
                  </Button>
                </Link>
                <GoogleSignInButton
                  source="cta_section"
                  text="Continue With Google"
                  className="w-full sm:w-auto text-[11px] sm:text-xs font-mono tracking-widest uppercase border-2 border-foreground px-4 py-2.5 hover:bg-muted rounded-none"
                />
              </>
            )}
          </div>

          <p className="mt-8 text-[10px] sm:text-xs text-muted-foreground font-mono tracking-[0.1em] uppercase">
            Free tier included • No credit card required
          </p>
        </div>
      </div>
    </section>
  )
}

export { CtaSection }
