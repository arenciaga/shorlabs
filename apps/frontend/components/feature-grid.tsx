import { Separator } from "@/components/ui/separator"
import { GitBranch, Scan, Rocket, Radio, Globe, Lock, Container, Zap } from "lucide-react"

const FEATURES = [
  {
    icon: GitBranch,
    title: "GitHub Import",
    description: "Connect your repo and deploy with one click.",
  },
  {
    icon: Scan,
    title: "Auto-Detection",
    description: "Detects your framework and configures automatically.",
  },
  {
    icon: Rocket,
    title: "Push to Deploy",
    description: "Every push to main triggers a new deployment.",
  },
  {
    icon: Radio,
    title: "Real-time Logs",
    description: "Stream build and runtime logs as they happen.",
  },
  {
    icon: Container,
    title: "Containerized",
    description: "Auto-packaged in Docker. Zero config needed.",
  },
  {
    icon: Zap,
    title: "Serverless",
    description: "Scales to zero. Pay only for what you use.",
  },
  {
    icon: Globe,
    title: "Custom Domains",
    description: "Add your domain with automatic SSL provisioning.",
  },
  {
    icon: Lock,
    title: "Env Variables",
    description: "Set secrets and config per project.",
  },
]

export function FeatureGrid() {
  return (
    <section id="features" className="w-full px-4 pt-6 pb-14 sm:px-6 sm:pt-8 sm:pb-16 lg:px-12 lg:pt-10 lg:pb-20">
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground whitespace-nowrap">
            {"// SECTION: FEATURES"}
          </span>
          <Separator className="flex-1" />
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground whitespace-nowrap">004</span>
        </div>

        <div className="bg-foreground border-2 border-foreground grid grid-cols-2 sm:grid-cols-4 gap-[2px]">
          {FEATURES.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="flex flex-col justify-between p-3 sm:p-4 bg-background aspect-square"
              >
                <Icon className="h-4 w-4 text-foreground" strokeWidth={1.5} />
                <div className="flex flex-col gap-0.5 sm:gap-1">
                  <h3 className="text-[10px] sm:text-xs font-mono font-bold tracking-tight uppercase text-foreground">
                    {feature.title}
                  </h3>
                  <p className="text-[8px] sm:text-[10px] font-mono text-muted-foreground leading-snug">
                    {feature.description}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
