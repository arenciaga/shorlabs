import {
    Database,
    Copy,
    Check,
    Eye,
    EyeOff,
    Loader2,
} from "lucide-react"
import type { Project } from "./types"
import type { DatabaseConnection } from "@/lib/api"

interface DatabaseConnectionDetailsProps {
    project: Project
    isBuilding: boolean
    dbConnection: DatabaseConnection | null
    showPassword: boolean
    loadingConnection: boolean
    copiedField: string | null
    onCopyField: (text: string, field: string) => void
    onTogglePassword: () => void
}

export function DatabaseConnectionDetails({
    project,
    isBuilding,
    dbConnection,
    showPassword,
    loadingConnection,
    copiedField,
    onCopyField,
    onTogglePassword,
}: DatabaseConnectionDetailsProps) {
    return (
        <div className="bg-zinc-50 rounded-none border border-zinc-200 p-4 sm:p-5 mb-6 sm:mb-8">
            <div className="flex items-center gap-2 text-zinc-500 mb-3">
                <Database className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Connection Details</span>
            </div>
            {project.status === "LIVE" ? (
                <div className="space-y-0">
                    {/* Host */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 py-2 border-b border-zinc-100 last:border-0">
                        <span className="text-sm text-zinc-500 shrink-0">Host</span>
                        <div className="flex items-center gap-2 min-w-0">
                            <code className="text-sm font-mono text-zinc-900 truncate">{project.db_endpoint}</code>
                            <button onClick={() => onCopyField(project.db_endpoint || "", "host")} className="p-1 hover:bg-zinc-100 rounded shrink-0">
                                {copiedField === "host" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
                            </button>
                        </div>
                    </div>
                    {/* Port */}
                    <div className="flex items-center justify-between py-2 border-b border-zinc-100 last:border-0">
                        <span className="text-sm text-zinc-500">Port</span>
                        <div className="flex items-center gap-2">
                            <code className="text-sm font-mono text-zinc-900">{project.db_port || 5432}</code>
                            <button onClick={() => onCopyField(String(project.db_port || 5432), "port")} className="p-1 hover:bg-zinc-100 rounded">
                                {copiedField === "port" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
                            </button>
                        </div>
                    </div>
                    {/* Database */}
                    <div className="flex items-center justify-between py-2 border-b border-zinc-100 last:border-0">
                        <span className="text-sm text-zinc-500">Database</span>
                        <div className="flex items-center gap-2">
                            <code className="text-sm font-mono text-zinc-900">{project.db_name || "postgres"}</code>
                            <button onClick={() => onCopyField(project.db_name || "postgres", "database")} className="p-1 hover:bg-zinc-100 rounded">
                                {copiedField === "database" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
                            </button>
                        </div>
                    </div>
                    {/* Username */}
                    <div className="flex items-center justify-between py-2 border-b border-zinc-100 last:border-0">
                        <span className="text-sm text-zinc-500">Username</span>
                        <div className="flex items-center gap-2">
                            <code className="text-sm font-mono text-zinc-900">{project.db_master_username || "admin"}</code>
                            <button onClick={() => onCopyField(project.db_master_username || "admin", "username")} className="p-1 hover:bg-zinc-100 rounded">
                                {copiedField === "username" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
                            </button>
                        </div>
                    </div>
                    {/* Password */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 py-2 border-b border-zinc-100 last:border-0">
                        <span className="text-sm text-zinc-500 shrink-0">Password</span>
                        <div className="flex items-center gap-2 min-w-0">
                            {showPassword && dbConnection ? (
                                <>
                                    <code className="text-sm font-mono text-zinc-900 truncate">{dbConnection.password}</code>
                                    <button onClick={() => onCopyField(dbConnection.password, "password")} className="p-1 hover:bg-zinc-100 rounded shrink-0">
                                        {copiedField === "password" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
                                    </button>
                                </>
                            ) : (
                                <code className="text-sm font-mono text-zinc-400">{"••••••••••••"}</code>
                            )}
                            <button
                                onClick={onTogglePassword}
                                disabled={loadingConnection}
                                className="p-1 hover:bg-zinc-100 rounded shrink-0"
                            >
                                {loadingConnection ? (
                                    <Loader2 className="h-3.5 w-3.5 text-zinc-400 animate-spin" />
                                ) : showPassword ? (
                                    <EyeOff className="h-3.5 w-3.5 text-zinc-400" />
                                ) : (
                                    <Eye className="h-3.5 w-3.5 text-zinc-400" />
                                )}
                            </button>
                        </div>
                    </div>
                    {/* Connection String */}
                    {showPassword && dbConnection && (
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 py-2">
                            <span className="text-sm text-zinc-500 shrink-0">Connection String</span>
                            <div className="flex items-center gap-2 min-w-0">
                                <code className="text-sm font-mono text-zinc-900 truncate">{dbConnection.connection_string}</code>
                                <button onClick={() => onCopyField(dbConnection.connection_string, "connection_string")} className="p-1 hover:bg-zinc-100 rounded shrink-0">
                                    {copiedField === "connection_string" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="text-zinc-400 text-sm">
                    {isBuilding ? "Provisioning database..." : "Database not available"}
                </div>
            )}
        </div>
    )
}
