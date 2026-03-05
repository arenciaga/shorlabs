import { Terminal, RefreshCw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LazyLog, ScrollFollow } from "@melloware/react-logviewer"

interface RuntimeLogsTabProps {
    logs: { timestamp: string; message: string; level: string }[]
    logsLoading: boolean
    onRefresh: () => void
}

export function RuntimeLogsTab({ logs, logsLoading, onRefresh }: RuntimeLogsTabProps) {
    return (
        <div className="bg-zinc-50 rounded-none border border-zinc-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
                <div className="flex items-center gap-3">
                    <Terminal className="h-5 w-5 text-zinc-400" />
                    <h3 className="font-semibold text-zinc-900">Runtime Logs</h3>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onRefresh}
                    disabled={logsLoading}
                    className="rounded-full"
                >
                    <RefreshCw className={`h-4 w-4 mr-2 ${logsLoading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            <div style={{ height: "384px" }}>
                {logsLoading && logs.length === 0 ? (
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
                                text={logs
                                    .map((log) => {
                                        const time = (() => {
                                            try { return new Date(log.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) }
                                            catch { return log.timestamp }
                                        })()
                                        const tsColor = "\x1b[38;2;161;161;170m" // zinc-400
                                        const prefix = log.level === "ERROR" ? "\x1b[38;2;220;38;38m" : log.level === "WARN" ? "\x1b[38;2;217;119;6m" : log.level === "SUCCESS" ? "\x1b[38;2;5;150;105m" : "\x1b[38;2;63;63;70m"
                                        return `${tsColor}${time}\x1b[0m  ${prefix}${log.message}\x1b[0m`
                                    })
                                    .join("\n")}
                                follow={follow}
                                onScroll={onScroll}
                                enableSearch
                                extraLines={1}
                                style={{
                                    background: "#f4f4f5",
                                    color: "#3f3f46",
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

            <div className="px-6 py-3 border-t border-zinc-100 bg-zinc-50">
                <p className="text-xs text-zinc-500">
                    {logs.length} log {logs.length === 1 ? "entry" : "entries"}
                </p>
            </div>
        </div>
    )
}
