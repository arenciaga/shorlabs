"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
import { ArrowLeft, ArrowRight, Globe, Database, Loader2, FolderOpen } from "lucide-react"
import { createBlankProject } from "@/lib/api"

function generateProjectName(): string {
    const adjectives = [
        "bold", "calm", "dark", "fast", "keen",
        "neat", "warm", "wise", "cool", "fair",
        "wild", "soft", "bright", "swift", "vivid",
    ]
    const nouns = [
        "falcon", "river", "storm", "ember", "cedar",
        "frost", "spark", "bloom", "coral", "drift",
        "atlas", "prism", "lunar", "orbit", "pulse",
    ]
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
    const noun = nouns[Math.floor(Math.random() * nouns.length)]
    const num = Math.floor(Math.random() * 100)
    return `${adj}-${noun}-${num}`
}

function NewProjectPageInner() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const { getToken, orgId } = useAuth()
    const projectId = searchParams.get("project_id")
    const isAddService = !!projectId
    const [creatingBlank, setCreatingBlank] = useState(false)

    const PROJECT_TYPES = [
        {
            id: "web-app",
            name: "Web App",
            description: "Deploy a web application from a Git repository",
            icon: Globe,
            href: projectId ? `/new/web-app?project_id=${projectId}` : "/new/web-app",
        },
        {
            id: "database",
            name: "Database",
            description: "Provision a PostgreSQL database with scale-to-zero",
            icon: Database,
            href: projectId ? `/new/database?project_id=${projectId}` : "/new/database",
        },
    ]

    const handleCreateBlankProject = async () => {
        if (creatingBlank || !orgId) return
        setCreatingBlank(true)
        try {
            const token = await getToken()
            if (!token) return
            const name = generateProjectName()
            const result = await createBlankProject(token, orgId, { name })
            router.push(`/projects/${result.project_id}`)
        } catch (err) {
            console.error("Failed to create blank project:", err)
            setCreatingBlank(false)
        }
    }

    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
                {/* Navigation */}
                <Link
                    href={isAddService ? `/projects/${projectId}` : "/projects"}
                    className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors mb-8 group"
                >
                    <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                    <span>{isAddService ? "Back to Project" : "Back to Projects"}</span>
                </Link>

                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
                        {isAddService ? "Add Service" : "New Project"}
                    </h1>
                    <p className="text-sm text-zinc-500 mt-1">
                        {isAddService
                            ? "Choose a service type to add to your project"
                            : "Choose a project type to get started"}
                    </p>
                </div>

                {/* Project Type List */}
                <div className="border border-zinc-200 divide-y divide-zinc-200">
                    {PROJECT_TYPES.map((type) => (
                        <Link
                            key={type.id}
                            href={type.href}
                            className="flex items-center gap-4 px-4 sm:px-6 py-4 hover:bg-zinc-50 transition-colors group"
                        >
                            <div className="w-10 h-10 rounded-none bg-zinc-900 flex items-center justify-center shrink-0">
                                <type.icon className="h-5 w-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="font-medium text-zinc-900">{type.name}</p>
                                    {type.id === "database" && (
                                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-800">
                                            Beta
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-zinc-500">{type.description}</p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-900 transition-colors shrink-0" />
                        </Link>
                    ))}
                </div>

                {/* Blank Project — only when creating a new project, not adding a service */}
                {!isAddService && (
                    <button
                        onClick={handleCreateBlankProject}
                        disabled={creatingBlank}
                        className="mt-4 w-full flex items-center gap-4 px-4 sm:px-6 py-4 border border-dashed border-zinc-300 hover:bg-zinc-50 hover:border-zinc-400 transition-colors group text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="w-10 h-10 rounded-none bg-zinc-100 flex items-center justify-center shrink-0">
                            {creatingBlank ? (
                                <Loader2 className="h-5 w-5 text-zinc-500 animate-spin" />
                            ) : (
                                <FolderOpen className="h-5 w-5 text-zinc-500" />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-medium text-zinc-900">Blank Project</p>
                            <p className="text-sm text-zinc-500">
                                Start with an empty project and add services later
                            </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-900 transition-colors shrink-0" />
                    </button>
                )}
            </div>
        </div>
    )
}

export default function NewProjectPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-white flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
        }>
            <NewProjectPageInner />
        </Suspense>
    )
}
