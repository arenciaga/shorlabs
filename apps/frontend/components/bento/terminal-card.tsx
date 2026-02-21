"use client"

import { Card } from "@/components/ui/card"

const LOG_LINES = [
  "> Connecting to GitHub...",
  "> Cloning repository...",
  "> Installing dependencies...",
  "> Building project...",
  "> Deploying to edge...",
  "> Status: DEPLOYED",
  "> URL: https://your-app.shorlabs.com",
  "> --------- DEPLOYMENT COMPLETE ---------",
]

export function TerminalCard() {
  return (
    <Card className="flex flex-col h-full rounded-none border-0 bg-transparent py-0 shadow-none gap-0">
      <div className="flex items-center gap-2 border-b-2 border-foreground px-3 sm:px-4 py-2">
        <span className="h-2 w-2 bg-muted-foreground" />
        <span className="h-2 w-2 bg-foreground" />
        <span className="h-2 w-2 border border-foreground" />
        <span className="ml-auto text-[10px] tracking-widest text-muted-foreground uppercase">
          terminal.shorlabs
        </span>
      </div>
      <div className="flex-1 bg-foreground p-3 sm:p-4 overflow-hidden">
        <div className="flex flex-col gap-1">
          {LOG_LINES.map((line, i) => (
            <span
              key={`${line}-${i}`}
              className="text-[11px] sm:text-xs text-background font-mono block break-all"
              style={{ opacity: i === LOG_LINES.length - 1 ? 1 : 0.6 }}
            >
              {line}
            </span>
          ))}
          <span className="text-xs text-muted-foreground font-mono">{"_"}</span>
        </div>
      </div>
    </Card>
  )
}
