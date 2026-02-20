"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-12">
      <Separator className="mb-6 h-0.5 bg-foreground" />
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-mono tracking-[0.15em] uppercase font-bold text-foreground">
            SHORLABS
          </span>
          <span className="text-[10px] font-mono tracking-widest text-muted-foreground">
            {`(C) ${currentYear} SHORLABS.`}
          </span>
        </div>
        <div className="flex w-full md:w-auto items-center md:justify-end gap-x-6 gap-y-2 flex-wrap">
            {[
            { label: "Privacy", href: "/privacy-policy" },
            { label: "Terms", href: "/terms-of-service" },
            { label: "GitHub", href: "https://github.com/aryankashyap0/shorlabs", external: true },
            { label: "Contact", href: "mailto:kashyaparyan093@gmail.com", external: true },
          ].map((link) => (
            link.external ? (
              <Button key={link.label} asChild variant="ghost" size="sm" className="h-auto px-0 py-0 text-[10px] font-mono tracking-widest uppercase text-muted-foreground hover:text-foreground">
                <a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>
              </Button>
            ) : (
              <Button key={link.label} asChild variant="ghost" size="sm" className="h-auto px-0 py-0 text-[10px] font-mono tracking-widest uppercase text-muted-foreground hover:text-foreground">
                <Link href={link.href}>{link.label}</Link>
              </Button>
            )
          ))}
        </div>
      </div>
    </footer>
  )
}
