"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@clerk/nextjs"
import { RefreshCw, Terminal, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet"
import { LazyLog, ScrollFollow } from "@melloware/react-logviewer"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

interface LogEntry {
    timestamp: string
    message: string
    level: "INFO" | "WARN" | "ERROR" | "SUCCESS"
}

interface LogsSheetProps {
    projectId: string
    projectName: string
    open: boolean
    onOpenChange: (open: boolean) => void
}

// ANSI RGB codes tuned for light zinc backgrounds
const ANSI = {
    reset: "\x1b[0m",
    timestamp: "\x1b[38;2;161;161;170m", // zinc-400
    error: "\x1b[38;2;220;38;38m",   // red-600
    warn: "\x1b[38;2;217;119;6m",   // amber-600
    success: "\x1b[38;2;5;150;105m",   // emerald-600
    info: "\x1b[38;2;63;63;70m",    // zinc-700
}

function logsToText(logs: LogEntry[]): string {
    if (logs.length === 0) return ""
    return logs
        .map((log) => {
            const time = (() => {
                try {
                    return new Date(log.timestamp).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                    })
                } catch {
                    return log.timestamp
                }
            })()

            const color =
                log.level === "ERROR" ? ANSI.error :
                    log.level === "WARN" ? ANSI.warn :
                        log.level === "SUCCESS" ? ANSI.success :
                            ANSI.info

            return `${ANSI.timestamp}${time}${ANSI.reset}  ${color}${log.message}${ANSI.reset}`
        })
        .join("\n")
}

export function LogsSheet({ projectId, projectName, open, onOpenChange }: LogsSheetProps) {
    const { getToken } = useAuth()
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [loading, setLoading] = useState(false)

    const fetchLogs = useCallback(async () => {
        if (!open) return

        try {
            setLoading(true)
            const token = await getToken()
            const response = await fetch(
                `${API_BASE_URL}/api/projects/${projectId}/runtime`,
                { headers: { Authorization: `Bearer ${token}` } }
            )

            if (!response.ok) throw new Error("Failed to fetch logs")

            const data = await response.json()
            setLogs(data.logs || [])
        } catch (err) {
            console.error("Error fetching logs:", err)
            setLogs([{
                timestamp: new Date().toISOString(),
                message: "Failed to load logs",
                level: "ERROR",
            }])
        } finally {
            setLoading(false)
        }
    }, [getToken, projectId, open])

    useEffect(() => {
        if (open) fetchLogs()
    }, [open, fetchLogs])

    const logText = logsToText(logs)

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col bg-white">
                <SheetHeader className="px-6 py-4 border-b border-zinc-100 shrink-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <SheetTitle className="text-lg font-semibold text-zinc-900">
                                Runtime Logs
                            </SheetTitle>
                            <SheetDescription className="text-sm text-zinc-500">
                                {projectName}
                            </SheetDescription>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchLogs}
                            disabled={loading}
                            className="rounded-full"
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>
                    </div>
                </SheetHeader>

                {/* Log Viewer — light zinc to match page */}
                <div className="flex-1 relative overflow-hidden border-b border-zinc-100">
                    {loading && logs.length === 0 ? (
                        <div className="flex items-center justify-center h-full bg-zinc-50">
                            <Loader2 className="h-6 w-6 text-zinc-400 animate-spin" />
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full bg-zinc-50 text-zinc-400">
                            <Terminal className="h-8 w-8 mb-3 opacity-40" />
                            <p className="text-sm">No logs available</p>
                            <p className="text-zinc-400 text-xs mt-1">
                                Invoke your function to see runtime logs
                            </p>
                        </div>
                    ) : (
                        <ScrollFollow
                            startFollowing
                            render={({ follow, onScroll }) => (
                                <LazyLog
                                    text={logText}
                                    follow={follow}
                                    onScroll={onScroll}
                                    enableSearch
                                    extraLines={1}
                                    style={{
                                        background: "#f4f4f5", // zinc-100
                                        color: "#3f3f46",      // zinc-700
                                        fontFamily: "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)",
                                        fontSize: "12px",
                                        height: "100%",
                                        width: "100%",
                                    }}
                                />
                            )}
                        />
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 bg-white shrink-0">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500">
                            {logs.length} log {logs.length === 1 ? "entry" : "entries"}
                        </span>
                        <span className="text-zinc-400">
                            {loading ? "Refreshing..." : "Auto-scroll enabled"}
                        </span>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}
