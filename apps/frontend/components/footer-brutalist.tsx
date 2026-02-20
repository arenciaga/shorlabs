"use client"

import Link from "next/link"

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="w-full border-t-2 border-foreground px-4 py-6 sm:px-6 sm:py-8 lg:px-12">
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
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-mono tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors duration-200"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.label}
                href={link.href}
                className="text-[10px] font-mono tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors duration-200"
              >
                {link.label}
              </Link>
            )
          ))}
        </div>
      </div>
    </footer>
  )
}
