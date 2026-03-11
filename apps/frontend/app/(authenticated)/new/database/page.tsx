"use client"

import { useState, Suspense } from "react"
import { useAuth } from "@clerk/nextjs"
import { useRouter, useSearchParams } from "next/navigation"
import {
    ArrowLeft,
    Database,
    Loader2,
    AlertCircle,
    Rocket,
    Zap,
    Lock,
} from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createDatabaseProject } from "@/lib/api"
import { trackEvent } from "@/lib/amplitude"
import { ACU_OPTIONS } from "@/lib/database"
import { useIsPro } from "@/hooks/use-is-pro"
import { useUpgradeModal, UpgradeModal } from "@/components/upgrade-modal"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export default function NewDatabasePage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-white" />}>
            <NewDatabaseContent />
        </Suspense>
    )
}

function NewDatabaseContent() {
    const { getToken, orgId } = useAuth()
    const router = useRouter()
    const searchParams = useSearchParams()
    const existingProjectId = searchParams.get("project_id")

    const { currentPlan } = useIsPro()
    const { isOpen, openUpgradeModal, closeUpgradeModal } = useUpgradeModal()

    const [projectName, setProjectName] = useState("")
    const [dbName, setDbName] = useState("shorlabs")

    // Initial value is the smallest available option
    const [maxAcu, setMaxAcu] = useState(0.5)
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

            let result: { project_id: string }

            if (existingProjectId) {
                // Add database service to existing project
                const url = new URL(`${API_BASE_URL}/api/projects/${existingProjectId}/services`)
                url.searchParams.append("org_id", orgId)
                const response = await fetch(url.toString(), {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        organization_id: orgId,
                        name: projectName.trim(),
                        service_type: "database",
                        db_name: dbName.trim(),
                        min_acu: 0,
                        max_acu: maxAcu,
                    }),
                })
                if (!response.ok) {
                    const errData = await response.json().catch(() => ({ detail: "Unknown error" }))
                    throw new Error(errData.detail || `HTTP ${response.status}`)
                }
                result = { project_id: existingProjectId }
            } else {
                // Create a new project with database service
                result = await createDatabaseProject(token, orgId, {
                    name: projectName.trim(),
                    db_name: dbName.trim(),
                    min_acu: 0,
                    max_acu: maxAcu,
                })
            }

            trackEvent("database_project_created", {
                project_id: result.project_id,
                max_acu: maxAcu,
                added_to_existing: !!existingProjectId,
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
                    href={existingProjectId ? `/new?project_id=${existingProjectId}` : "/new"}
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
                    {/* Service Name */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-900 mb-2">
                            Service Name
                        </label>
                        <Input
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            placeholder="my-database"
                            className="h-10"
                        />
                        <p className="text-xs text-zinc-400 mt-1">Name for your database service</p>
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
                        <div className="grid grid-cols-3 gap-3">
                            {ACU_OPTIONS.map((option) => {
                                const isPlusRequired = option.minPlan === "plus" && currentPlan !== "pro" && currentPlan !== "plus";
                                const locked = isPlusRequired;
                                const lockText = isPlusRequired ? "Plus" : "";

                                return (
                                    <button
                                        key={option.value}
                                        onClick={() => {
                                            if (locked) {
                                                openUpgradeModal()
                                            } else {
                                                setMaxAcu(option.value)
                                            }
                                        }}
                                        className={`px-2 py-2.5 sm:px-3 sm:py-3 border text-center transition-colors relative ${maxAcu === option.value
                                            ? "border-zinc-900 bg-zinc-900 text-white"
                                            : "border-zinc-200 hover:border-zinc-400 text-zinc-700"
                                            } ${locked ? "opacity-60 bg-zinc-50 cursor-pointer" : ""}`}
                                    >
                                        <div className="text-sm font-medium flex items-center justify-center gap-1.5">
                                            {locked && <Lock className="w-3.5 h-3.5 text-zinc-400" />}
                                            {option.label}
                                        </div>
                                        <div className={`text-xs mt-0.5 ${maxAcu === option.value ? "text-zinc-300" : "text-zinc-400"}`}>
                                            {option.description}
                                        </div>
                                        {locked && (
                                            <div className="absolute -top-2 -right-2">
                                                <span className="bg-zinc-800 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider shadow-sm">
                                                    {lockText}
                                                </span>
                                            </div>
                                        )}
                                    </button>
                                )
                            })}
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

            <UpgradeModal isOpen={isOpen} onClose={closeUpgradeModal} />
        </div>
    )
}
