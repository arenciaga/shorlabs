"use client"

import Link from "next/link"
import { ArrowLeft, ArrowRight, Globe } from "lucide-react"

const PROJECT_TYPES = [
    {
        id: "web-app",
        name: "Web App",
        description: "Deploy a web application from a Git repository",
        icon: Globe,
        href: "/new/web-app",
    },
]

export default function NewProjectPage() {
    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
                {/* Navigation */}
                <Link
                    href="/projects"
                    className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors mb-8 group"
                >
                    <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                    <span>Back to Projects</span>
                </Link>

                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">New Project</h1>
                    <p className="text-sm text-zinc-500 mt-1">Choose a project type to get started</p>
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
                                <p className="font-medium text-zinc-900">{type.name}</p>
                                <p className="text-sm text-zinc-500">{type.description}</p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-900 transition-colors shrink-0" />
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    )
}
