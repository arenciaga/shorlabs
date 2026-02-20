"use client"

import { Rocket } from "lucide-react"
import Link from "next/link"
import { useAuth } from "@clerk/nextjs"
import { BookDemoButton } from "@/components/BookDemoButton"

export function Navbar() {
  const { isSignedIn } = useAuth()

  return (
    <div className="w-full px-4 pt-4 lg:px-6 lg:pt-6">
      <nav className="w-full border border-foreground/20 bg-background/80 backdrop-blur-sm px-6 py-3 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <Rocket size={16} strokeWidth={1.5} />
            <span className="text-xs font-mono tracking-[0.15em] uppercase font-bold">
              SHORLABS
            </span>
          </div>

          {/* Center nav links */}
          <div className="hidden md:flex items-center gap-8">
            {["Features", "Pricing", "Blog"].map((link) => (
              <a
                key={link}
                href={link === "Blog" ? "/blog" : `#${link.toLowerCase()}`}
                className="text-xs font-mono tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors duration-200"
              >
                {link}
              </a>
            ))}
          </div>

          {/* Right side: Login + CTA */}
          <div className="flex items-center gap-4">
            {isSignedIn ? (
              <Link
                href="/projects"
                className="hidden sm:block text-xs font-mono tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors duration-200"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/sign-in"
                className="hidden sm:block text-xs font-mono tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors duration-200"
              >
                Sign In
              </Link>
            )}
            <BookDemoButton className="bg-foreground text-background px-4 py-2 text-xs font-mono tracking-widest uppercase">
              Schedule Call
            </BookDemoButton>
          </div>
        </div>
      </nav>
    </div>
  )
}
