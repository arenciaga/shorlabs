import { Separator } from "@/components/ui/separator"
import { GitBranch, Database, Layers, Radio, Globe, Lock, Container, Zap } from "lucide-react"

const FEATURES = [
  {
    icon: GitBranch,
    title: "GitHub Import",
    description: "Connect your repo and deploy with one click.",
  },
  {
    icon: Database,
    title: "Managed Databases",
    description: "Serverless PostgreSQL with auto-scaling.",
  },
  {
    icon: Layers,
    title: "Multi-Service Projects",
    description: "Combine web apps, services, and databases in one project.",
  },
  {
    icon: Radio,
    title: "Real-time Logs",
    description: "Stream build and runtime logs as they happen.",
  },
  {
    icon: Container,
    title: "Containerized",
    description: "Auto-packaged in Docker. Zero config.",
  },
  {
    icon: Zap,
    title: "Serverless & Always-On",
    description: "From scale-to-zero to dedicated instances.",
  },
  {
    icon: Globe,
    title: "Custom Domains",
    description: "Add your domain with automatic SSL.",
  },
  {
    icon: Lock,
    title: "Database Explorer",
    description: "Manage tables, columns, and data from the UI.",
  },
]

export function FeatureGrid() {
  return (
    <section id="features" className="w-full px-4 pt-6 pb-8 sm:px-6 sm:pt-8 sm:pb-10 lg:px-12 lg:pt-10 lg:pb-12">
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
                className="flex flex-col gap-4 sm:gap-5 p-4 sm:p-5 bg-background"
              >
                <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-foreground" strokeWidth={1.5} />
                <div className="flex flex-col gap-1 sm:gap-1.5">
                  <h3 className="text-xs sm:text-sm font-mono font-bold tracking-tight uppercase text-foreground">
                    {feature.title}
                  </h3>
                  <p className="text-[10px] sm:text-xs font-mono text-muted-foreground leading-relaxed">
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
