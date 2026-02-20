"use client"

import Link from "next/link"
import { useAuth } from "@clerk/nextjs"
import { BookDemoButton } from "@/components/BookDemoButton"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

export function Navbar() {
  const { isSignedIn } = useAuth()

  return (
    <div className="w-full px-3 pt-3 sm:px-4 sm:pt-4 lg:px-6 lg:pt-6">
      <nav className="w-full border border-foreground/20 bg-background/80 backdrop-blur-sm px-3 py-2.5 sm:px-5 sm:py-3 lg:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-[10px] sm:text-xs font-mono tracking-[0.15em] uppercase font-bold">
              SHORLABS
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-6 xl:gap-8">
            {["Features", "Pricing", "Blog"].map((link) => (
              <Button
                key={link}
                asChild
                variant="ghost"
                size="sm"
                className="h-auto px-0 py-0 text-[10px] xl:text-xs font-mono tracking-widest uppercase text-muted-foreground hover:text-foreground"
              >
                <a href={link === "Blog" ? "/blog" : `#${link.toLowerCase()}`}>{link}</a>
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {isSignedIn ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="hidden md:inline-flex h-auto px-0 py-0 text-[10px] xl:text-xs font-mono tracking-widest uppercase text-muted-foreground hover:text-foreground"
              >
                <Link href="/projects">Dashboard</Link>
              </Button>
            ) : (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="hidden md:inline-flex h-auto px-0 py-0 text-[10px] xl:text-xs font-mono tracking-widest uppercase text-muted-foreground hover:text-foreground"
              >
                <Link href="/sign-in">Sign In</Link>
              </Button>
            )}
            <Separator orientation="vertical" className="hidden md:block h-5 bg-border" />
            <BookDemoButton className="bg-foreground text-background h-9 px-3 sm:px-4 text-[10px] sm:text-xs font-mono tracking-widest uppercase whitespace-nowrap">
              Book Demo
            </BookDemoButton>
          </div>
        </div>
      </nav>
    </div>
  )
}
