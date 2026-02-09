"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useAuth } from "@clerk/nextjs"
import {
    Loader2,
    Terminal,
    CheckCircle2,
    XCircle,
    ChevronDown,
    ChevronUp,
    RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { trackEvent } from "@/lib/amplitude"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

interface LogEntry {
    timestamp: string
    message: string
    level: "INFO" | "WARN" | "ERROR" | "SUCCESS"
}

interface DeploymentLogsProps {
    projectId: string
    deployId: string
    buildId: string
    orgId: string
    status: "IN_PROGRESS" | "SUCCEEDED" | "FAILED"
    isExpanded: boolean
    onToggle: () => void
    onComplete?: () => void
}

const BUILD_PHASES = [
    "SUBMITTED",
    "QUEUED",
    "PROVISIONING",
    "DOWNLOAD_SOURCE",
    "INSTALL",
    "PRE_BUILD",
    "BUILD",
    "POST_BUILD",
    "UPLOAD_ARTIFACTS",
    "FINALIZING",
    "COMPLETED",
]

export function DeploymentLogs({
    projectId,
    deployId,
    buildId,
    orgId,
    status,
    isExpanded,
    onToggle,
    onComplete,
}: DeploymentLogsProps) {
    const { getToken } = useAuth()
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [currentPhase, setCurrentPhase] = useState<string>("QUEUED")
    const [isStreaming, setIsStreaming] = useState(false)
    const logsContainerRef = useRef<HTMLDivElement>(null)
    const eventSourceRef = useRef<EventSource | null>(null)

    // Auto-scroll to bottom when new logs arrive
    useEffect(() => {
        if (logsContainerRef.current && isExpanded) {
            logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
        }
    }, [logs, isExpanded])

    // Fetch logs (for completed builds)
    const fetchLogs = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const token = await getToken()
            const url = new URL(`${API_BASE_URL}/api/deployments/${projectId}/${deployId}/logs`)
            url.searchParams.append("org_id", orgId)
            const response = await fetch(
                url.toString(),
                { headers: { Authorization: `Bearer ${token}` } }
            )
            if (!response.ok) {
                throw new Error("Failed to fetch logs")
            }
            const data = await response.json()
            setLogs(data.logs || [])
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch logs")
        } finally {
            setLoading(false)
        }
    }, [getToken, projectId, deployId, orgId])

    // Start SSE streaming (for in-progress builds)
    const startStreaming = useCallback(async () => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close()
        }

        setIsStreaming(true)
        setError(null)

        try {
            const token = await getToken()

            // Create EventSource with auth header via fetch
            // Note: EventSource doesn't support headers, so we'll poll instead
            // for SSE with auth, using a custom fetch-based approach
            const pollLogs = async () => {
                while (isStreaming) {
                    try {
                        const pollUrl = new URL(`${API_BASE_URL}/api/deployments/${projectId}/${deployId}/logs`)
                        pollUrl.searchParams.append("org_id", orgId)
                        const response = await fetch(
                            pollUrl.toString(),
                            { headers: { Authorization: `Bearer ${token}` } }
                        )
                        if (response.ok) {
                            const data = await response.json()
                            setLogs(data.logs || [])

                            // Check if complete
                            if (data.status === "SUCCEEDED" || data.status === "FAILED") {
                                // Track deployment completion
                                trackEvent('Deployment Completed', {
                                    project_id: projectId,
                                    deployment_id: deployId,
                                    build_id: buildId,
                                    status: data.status,
                                })

                                setIsStreaming(false)
                                onComplete?.()
                                break
                            }
                        }
                    } catch {
                        // Ignore polling errors
                    }
                    await new Promise(resolve => setTimeout(resolve, 2000))
                }
            }

            pollLogs()

        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to start streaming")
            setIsStreaming(false)
        }
    }, [getToken, projectId, deployId, orgId, onComplete, isStreaming])

    // Load logs when expanded
    useEffect(() => {
        if (!isExpanded) return

        if (status === "IN_PROGRESS") {
            startStreaming()
        } else {
            fetchLogs()
        }

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close()
            }
            setIsStreaming(false)
        }
    }, [isExpanded, status, fetchLogs, startStreaming])

    // Get phase index for progress
    const phaseIndex = BUILD_PHASES.indexOf(currentPhase)
    const progressPercent = Math.max(0, Math.min(100, (phaseIndex / (BUILD_PHASES.length - 1)) * 100))

    return (
        <div className="border-t border-zinc-100">
            {/* Toggle Header */}
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between px-4 sm:px-6 py-3 hover:bg-zinc-50 transition-colors text-left"
            >
                <div className="flex items-center gap-2 text-sm text-zinc-600">
                    <Terminal className="h-4 w-4" />
                    <span className="font-medium">Build Logs</span>
                    {status === "IN_PROGRESS" && isStreaming && (
                        <span className="flex items-center gap-1 text-xs text-blue-600">
                            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                            Live
                        </span>
                    )}
                </div>
                {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-zinc-400" />
                ) : (
                    <ChevronDown className="h-4 w-4 text-zinc-400" />
                )}
            </button>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="px-4 sm:px-6 pb-4">
                    {/* Build Progress (for in-progress builds) */}
                    {status === "IN_PROGRESS" && (
                        <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-zinc-500 font-medium">
                                    {currentPhase.replace(/_/g, " ")}
                                </span>
                                <span className="text-xs text-zinc-400">
                                    {Math.round(progressPercent)}%
                                </span>
                            </div>
                            <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-900 rounded-full transition-all duration-500"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Status Bar */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            {status === "SUCCEEDED" && (
                                <div className="flex items-center gap-1.5 text-emerald-600">
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span className="text-xs font-medium">Build Successful</span>
                                </div>
                            )}
                            {status === "FAILED" && (
                                <div className="flex items-center gap-1.5 text-red-600">
                                    <XCircle className="h-4 w-4" />
                                    <span className="text-xs font-medium">Build Failed</span>
                                </div>
                            )}
                            {status === "IN_PROGRESS" && (
                                <div className="flex items-center gap-1.5 text-blue-600">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span className="text-xs font-medium">Building...</span>
                                </div>
                            )}
                        </div>
                        {status !== "IN_PROGRESS" && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={fetchLogs}
                                disabled={loading}
                                className="h-7 text-xs"
                            >
                                <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
                                Refresh
                            </Button>
                        )}
                    </div>

                    {/* Log Output */}
                    <div
                        ref={logsContainerRef}
                        className="h-80 overflow-y-auto bg-zinc-900 rounded-xl p-4 font-mono text-xs"
                    >
                        {loading && logs.length === 0 ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="h-6 w-6 text-zinc-500 animate-spin" />
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center justify-center h-full text-red-400">
                                <XCircle className="h-6 w-6 mb-2" />
                                <p>{error}</p>
                            </div>
                        ) : logs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                                <Terminal className="h-8 w-8 mb-3 opacity-50" />
                                <p>Waiting for logs...</p>
                            </div>
                        ) : (
                            <div className="space-y-0.5">
                                {logs.map((log, index) => {
                                    const levelColor =
                                        log.level === "ERROR"
                                            ? "text-red-400"
                                            : log.level === "WARN"
                                                ? "text-amber-400"
                                                : log.level === "SUCCESS"
                                                    ? "text-emerald-400"
                                                    : "text-zinc-300"
                                    return (
                                        <div key={index} className="flex gap-3 leading-relaxed">
                                            <span className="text-zinc-600 shrink-0 select-none">
                                                {new Date(log.timestamp).toLocaleTimeString("en-US", {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    second: "2-digit",
                                                    hour12: false,
                                                })}
                                            </span>
                                            <span className={levelColor}>{log.message}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    {/* Build ID */}
                    <div className="mt-3 text-xs text-zinc-400">
                        Build ID: <span className="font-mono">{buildId}</span>
                    </div>
                </div>
            )}
        </div>
    )
}
