"use client"

import { useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import {
    ArrowLeft,
    Database,
    Loader2,
    AlertCircle,
    Rocket,
    Zap,
} from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createDatabaseProject } from "@/lib/api"
import { trackEvent } from "@/lib/amplitude"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

const ACU_OPTIONS = [
    { value: 0.5, label: "Starter", description: "Side projects" },
    { value: 1, label: "Small", description: "Light apps" },
    { value: 2, label: "Medium", description: "Most apps" },
    { value: 4, label: "Large", description: "Production" },
    { value: 8, label: "XL", description: "High traffic" },
]

export default function NewDatabasePage() {
    const { getToken, orgId } = useAuth()
    const router = useRouter()

    const [projectName, setProjectName] = useState("")
    const [dbName, setDbName] = useState("shorlabs")
    const [maxAcu, setMaxAcu] = useState(2)
    const [deploying, setDeploying] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const canDeploy = projectName.trim().length > 0 && dbName.trim().length > 0

    const handleDeploy = async () => {
        if (!canDeploy || deploying) return
        setDeploying(true)
        setError(null)

        try {
            const token = await getToken()
            if (!token || !orgId) {
                setError("Authentication required")
                setDeploying(false)
                return
            }

            const result = await createDatabaseProject(token, orgId, {
                name: projectName.trim(),
                db_name: dbName.trim(),
                min_acu: 0,
                max_acu: maxAcu,
            })

            trackEvent("database_project_created", {
                project_id: result.project_id,
                max_acu: maxAcu,
            })

            router.push(`/projects/${result.project_id}`)
        } catch (err: any) {
            setError(err.message || "Failed to create database")
            setDeploying(false)
        }
    }

    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
                {/* Navigation */}
                <Link
                    href="/new"
                    className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors mb-6 sm:mb-8 group"
                >
                    <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                    <span>Back</span>
                </Link>

                {/* Header */}
                <div className="mb-6 sm:mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-zinc-900 flex items-center justify-center">
                            <Database className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">New Database</h1>
                            <p className="text-sm text-zinc-500">PostgreSQL — scales to zero when idle</p>
                        </div>
                    </div>
                </div>

                {/* Scale-to-zero info */}
                <div className="flex items-start gap-3 px-4 py-3 bg-blue-50 border border-blue-200 mb-6 sm:mb-8">
                    <Zap className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-blue-800">
                        <p className="font-medium">Scales to zero automatically</p>
                        <p className="text-blue-600 mt-0.5">When no one is connected, your database pauses and you only pay for storage.</p>
                    </div>
                </div>

                {/* Configuration Form */}
                <div className="space-y-5 sm:space-y-6">
                    {/* Project Name */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-900 mb-2">
                            Project Name
                        </label>
                        <Input
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            placeholder="my-database"
                            className="h-10"
                        />
                        <p className="text-xs text-zinc-400 mt-1">Display name for your project</p>
                    </div>

                    {/* Database Name */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-900 mb-2">
                            Database Name
                        </label>
                        <Input
                            value={dbName}
                            onChange={(e) => setDbName(e.target.value)}
                            placeholder="shorlabs"
                            className="h-10 font-mono"
                        />
                        <p className="text-xs text-zinc-400 mt-1">Name of the initial PostgreSQL database</p>
                    </div>

                    {/* Max ACU */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-900 mb-2">
                            Database Size
                        </label>
                        <p className="text-xs text-zinc-500 mb-3">
                            How much compute your database can use at peak. It always scales down to zero when idle.
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                            {ACU_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    onClick={() => setMaxAcu(option.value)}
                                    className={`px-2 py-2.5 sm:px-3 sm:py-3 border text-center transition-colors ${
                                        maxAcu === option.value
                                            ? "border-zinc-900 bg-zinc-900 text-white"
                                            : "border-zinc-200 hover:border-zinc-400 text-zinc-700"
                                    }`}
                                >
                                    <div className="text-sm font-medium">{option.label}</div>
                                    <div className={`text-xs mt-0.5 ${maxAcu === option.value ? "text-zinc-300" : "text-zinc-400"}`}>
                                        {option.description}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Deploy Button */}
                    <Button
                        onClick={handleDeploy}
                        disabled={!canDeploy || deploying}
                        className="w-full h-11 bg-zinc-900 hover:bg-zinc-800 text-white font-medium"
                    >
                        {deploying ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Provisioning...
                            </>
                        ) : (
                            <>
                                <Rocket className="h-4 w-4 mr-2" />
                                Create Database
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}
