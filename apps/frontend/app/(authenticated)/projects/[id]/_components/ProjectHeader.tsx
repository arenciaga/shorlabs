import { Github, ExternalLink, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { STATUS_CONFIG } from "./constants"
import type { Project } from "./types"

interface ProjectHeaderProps {
    project: Project
    isBuilding: boolean
    redeploying: boolean
    onRedeploy: () => void
}

export function ProjectHeader({ project, isBuilding, redeploying, onRedeploy }: ProjectHeaderProps) {
    const statusConfig = STATUS_CONFIG[project.status] || STATUS_CONFIG.PENDING

    return (
        <div className="flex items-center gap-3 py-3 mb-4">
            {/* Name + status */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
                <h1 className="text-xl font-semibold text-zinc-900 tracking-tight truncate">{project.name}</h1>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-50 border border-zinc-200 shrink-0 ${statusConfig.bgGlow}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot} ${isBuilding ? 'animate-pulse' : ''}`} />
                    <span className={`text-xs font-medium ${statusConfig.color}`}>{statusConfig.label}</span>
                </div>
                <a
                    href={project.github_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hidden sm:inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-900 transition-colors shrink-0"
                >
                    <Github className="h-3.5 w-3.5" />
                    <span className="font-mono text-xs">{project.github_repo}</span>
                    <ExternalLink className="h-3 w-3" />
                </a>
            </div>

            {/* Redeploy button */}
            <Button
                onClick={onRedeploy}
                disabled={isBuilding || redeploying || project.is_throttled}
                className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-full h-9 px-4 text-sm shrink-0"
                title={
                    project.is_throttled
                        ? "Redeploy is paused while your organization is over quota."
                        : isBuilding
                            ? "A deployment is in progress — will auto-queue."
                            : "Trigger a new deployment."
                }
            >
                <RotateCw className={`h-3.5 w-3.5 mr-1.5 ${redeploying ? 'animate-spin' : ''}`} />
                {project.is_throttled ? "Paused" : "Redeploy"}
            </Button>
        </div>
    )
}
