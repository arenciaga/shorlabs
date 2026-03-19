import Link from "next/link"
import { ArrowLeft } from "lucide-react"

interface ProjectBreadcrumbProps {
    projectName: string
    serviceName?: string
    isDatabase?: boolean
    onBackToCanvas?: () => void
}

export function ProjectBreadcrumb({ projectName, serviceName, isDatabase, onBackToCanvas }: ProjectBreadcrumbProps) {
    // Suppress unused isDatabase warning since DatabaseProjectView forces casting
    if (isDatabase) { /* no-op */ }

    return (
        <div className="flex items-center gap-2 pt-5 pb-4">
            <Link
                href="/projects"
                className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-900 transition-colors group"
            >
                <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
                <span>Projects</span>
            </Link>
            <span className="text-zinc-300">/</span>

            {onBackToCanvas ? (
                <>
                    <button
                        onClick={onBackToCanvas}
                        className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
                    >
                        {projectName}
                    </button>
                    <span className="text-zinc-300">/</span>
                    <span className="text-sm text-zinc-900 font-medium truncate">
                        {serviceName || "Service"}
                    </span>
                </>
            ) : (
                <span className="text-sm text-zinc-900 font-medium truncate">{projectName}</span>
            )}
        </div>
    )
}
