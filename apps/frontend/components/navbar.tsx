"use client"

import Link from "next/link"
import { useAuth } from "@clerk/nextjs"
import { BookDemoButton } from "@/components/BookDemoButton"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Menu } from "lucide-react"

export function Navbar() {
  const { isSignedIn } = useAuth()
  const navLinks = [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "Blog", href: "/blog" },
  ]

  return (
    <div className="w-full px-3 pt-3 sm:px-4 sm:pt-4 lg:px-6 lg:pt-6">
      <nav className="mx-auto w-full max-w-7xl border border-foreground/20 bg-background/80 backdrop-blur-sm px-3 py-2.5 sm:px-5 sm:py-3 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link href="/" className="text-[10px] sm:text-xs font-mono tracking-[0.15em] uppercase font-bold">
              SHORLABS
            </Link>
          </div>

          <div className="hidden lg:flex items-center gap-6 xl:gap-8">
            {navLinks.map((link) => (
              <Button
                key={link.label}
                asChild
                variant="ghost"
                size="sm"
                className="h-auto px-0 py-0 text-[10px] xl:text-xs font-mono tracking-widest uppercase text-muted-foreground hover:text-foreground"
              >
                <a href={link.href}>{link.label}</a>
              </Button>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-2 sm:gap-3 shrink-0">
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

          <div className="flex lg:hidden items-center gap-2 shrink-0">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="rounded-none border-foreground/40"
                  aria-label="Open navigation menu"
                >
                  <Menu size={16} />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[85vw] max-w-[360px] p-0">
                <SheetHeader className="border-b border-border px-4 py-4">
                  <SheetTitle className="text-xs font-mono tracking-[0.15em] uppercase">
                    SHORLABS
                  </SheetTitle>
                </SheetHeader>

                <div className="flex flex-col gap-1 p-4">
                  {navLinks.map((link) => (
                    <SheetClose asChild key={link.label}>
                      <Button
                        asChild
                        variant="ghost"
                        className="justify-start rounded-none font-mono text-xs tracking-widest uppercase"
                      >
                        <a href={link.href}>{link.label}</a>
                      </Button>
                    </SheetClose>
                  ))}

                  <Separator className="my-2" />

                  <SheetClose asChild>
                    <Button
                      asChild
                      variant="ghost"
                      className="justify-start rounded-none font-mono text-xs tracking-widest uppercase"
                    >
                      <Link href={isSignedIn ? "/projects" : "/sign-in"}>
                        {isSignedIn ? "Dashboard" : "Sign In"}
                      </Link>
                    </Button>
                  </SheetClose>

                  <BookDemoButton className="mt-2 w-full rounded-none bg-foreground text-background font-mono text-xs tracking-widest uppercase">
                    Book Demo
                  </BookDemoButton>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>
    </div>
  )
}
