import Link from "next/link"
import { ArrowLeft, Database } from "lucide-react"

interface ProjectBreadcrumbProps {
    projectName: string
    isDatabase?: boolean
}

export function ProjectBreadcrumb({ projectName, isDatabase }: ProjectBreadcrumbProps) {
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
            <span className="text-sm text-zinc-900 font-medium truncate">{projectName}</span>
        </div>
    )
}
