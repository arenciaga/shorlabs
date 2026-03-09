"use client"

import { useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { Database, Check, Loader2 } from "lucide-react"
import type { Service } from "./types"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

const ACU_OPTIONS = [
    { value: 0.5, label: "Starter", description: "Side projects" },
    { value: 1, label: "Small", description: "Light apps" },
    { value: 2, label: "Medium", description: "Most apps" },
    { value: 4, label: "Large", description: "Production" },
    { value: 8, label: "XL", description: "High traffic" },
]

function resolveCurrentTier(maxAcu: number | null | undefined) {
    if (maxAcu == null) return null
    // Find the closest tier
    return ACU_OPTIONS.reduce((closest, option) =>
        Math.abs(option.value - maxAcu) < Math.abs(closest.value - maxAcu) ? option : closest
    )
}

interface DatabaseConfigTabProps {
    service: Service
    projectId: string
    onRefresh: () => void
}

export function DatabaseConfigTab({ service, projectId, onRefresh }: DatabaseConfigTabProps) {
    const { getToken, orgId } = useAuth()
    const currentTier = resolveCurrentTier(service.max_acu)
    const [selectedAcu, setSelectedAcu] = useState<number>(currentTier?.value ?? 2)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    const hasChanged = selectedAcu !== (currentTier?.value ?? 2)

    const handleSave = async () => {
        if (!hasChanged || saving) return
        setSaving(true)
        setError(null)
        setSuccess(false)

        try {
            const token = await getToken()
            const url = new URL(`${API_BASE_URL}/api/projects/${projectId}`)
            if (orgId) url.searchParams.append("org_id", orgId)
            url.searchParams.append("service_id", service.service_id)

            const response = await fetch(url.toString(), {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ max_acu: selectedAcu }),
            })

            if (!response.ok) {
                const data = await response.json().catch(() => ({ detail: "Unknown error" }))
                throw new Error(data.detail || "Failed to update")
            }

            setSuccess(true)
            onRefresh()
            setTimeout(() => setSuccess(false), 3000)
        } catch (err: any) {
            setError(err.message || "Failed to update database size")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Database Size */}
            <div className="bg-white border border-zinc-200 overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-zinc-100">
                    <Database className="h-4 w-4 text-zinc-400" />
                    <h3 className="font-semibold text-zinc-900 text-sm">Database Size</h3>
                </div>
                <div className="p-5">
                    <p className="text-xs text-zinc-500 mb-4">
                        How much compute your database can use at peak. It always scales down to zero when idle.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                        {ACU_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                onClick={() => { setSelectedAcu(option.value); setSuccess(false) }}
                                className={`px-3 py-3 border text-center transition-colors cursor-pointer ${
                                    selectedAcu === option.value
                                        ? "border-zinc-900 bg-zinc-900 text-white"
                                        : "border-zinc-200 hover:border-zinc-400 text-zinc-700"
                                }`}
                            >
                                <div className="text-sm font-medium">{option.label}</div>
                                <div className={`text-xs mt-0.5 ${
                                    selectedAcu === option.value ? "text-zinc-300" : "text-zinc-400"
                                }`}>
                                    {option.description}
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Save button + feedback */}
                    <div className="mt-4 flex items-center gap-3">
                        <button
                            onClick={handleSave}
                            disabled={!hasChanged || saving}
                            className={`px-4 py-2 text-sm font-medium transition-all ${
                                hasChanged && !saving
                                    ? "bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer"
                                    : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                            }`}
                        >
                            {saving ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Applying...
                                </span>
                            ) : "Save Changes"}
                        </button>
                        {success && (
                            <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                                <Check className="h-3.5 w-3.5" />
                                Applied to cluster
                            </span>
                        )}
                        {error && (
                            <span className="text-xs text-red-600">{error}</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Read-only info */}
            <div className="bg-white border border-zinc-200 overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-zinc-100">
                    <h3 className="font-semibold text-zinc-900 text-sm">Cluster Info</h3>
                </div>
                <div className="p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Cluster</span>
                            <p className="text-sm text-zinc-900 font-mono mt-1">{service.db_cluster_identifier || "—"}</p>
                        </div>
                        <div>
                            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Engine</span>
                            <p className="text-sm text-zinc-900 mt-1">PostgreSQL (Aurora Serverless v2)</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
