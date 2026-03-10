"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { ExternalLink } from "lucide-react"
import { GitHubIcon, PostgreSQLIcon } from "@/components/service-icons"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { STATUS_CONFIG } from "../constants"
import type { Service } from "../types"

export interface ServiceNodeData extends Record<string, unknown> {
    service: Service
}

export const ServiceNode = memo(function ServiceNode({ data }: NodeProps) {
    const { service } = data as ServiceNodeData
    const isDb = service.service_type === "database"
    const statusConfig = STATUS_CONFIG[service.status] || STATUS_CONFIG.PENDING
    const isBuilding = !["LIVE", "FAILED", "DELETING"].includes(service.status)
    const latestDeploy = service.deployments?.[0]

    return (
        <Card className="w-[240px] gap-0 p-0 rounded-none bg-white cursor-pointer hover:border-zinc-400 hover:shadow-md transition-all group">
            {/* Colored top accent bar */}
            <div className={`h-1 w-full ${
                service.status === "LIVE" ? "bg-emerald-500" :
                service.status === "FAILED" ? "bg-red-500" :
                isBuilding ? "bg-blue-500" : "bg-zinc-300"
            }`} />

            <div className="p-4">
                {/* Header: icon + name */}
                <div className="flex items-center gap-3 mb-3">
                    <div className={`w-9 h-9 flex items-center justify-center shrink-0 ${
                        isDb ? "bg-purple-50" : "bg-blue-50"
                    }`}>
                        {isDb ? (
                            <PostgreSQLIcon className="h-5 w-5" />
                        ) : (
                            <GitHubIcon className="h-4.5 w-4.5 text-blue-500" />
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-zinc-900 truncate">
                            {service.name || (isDb ? "Database" : "Web App")}
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                            {isDb ? "PostgreSQL" : "Web App"}
                        </div>
                    </div>
                </div>

                {/* Status */}
                <div className="flex items-center justify-between mb-3">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Badge
                                variant="outline"
                                className={`rounded-none px-1.5 py-0.5 text-[11px] gap-1.5 ${statusConfig.color} border-zinc-200`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot} ${isBuilding ? "animate-pulse" : ""}`} />
                                {statusConfig.label}
                            </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            {statusConfig.label}
                        </TooltipContent>
                    </Tooltip>
                    <ExternalLink className="h-3.5 w-3.5 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
                </div>

                <Separator className="mb-2.5" />

                {/* Key metric */}
                <div>
                    {!isDb && service.function_url && (
                        <div className="text-[11px] font-mono text-zinc-400 truncate">
                            {service.function_url.replace("https://", "").split("/")[0]}
                        </div>
                    )}
                    {!isDb && !service.function_url && latestDeploy && (
                        <div className="text-[11px] text-zinc-400 truncate">
                            {latestDeploy.commit_message || latestDeploy.commit_sha?.slice(0, 7) || "No deployments"}
                        </div>
                    )}
                    {!isDb && !service.function_url && !latestDeploy && (
                        <div className="text-[11px] text-zinc-400">No deployments yet</div>
                    )}
                    {isDb && (
                        <div className="text-[11px] font-mono text-zinc-400 truncate">
                            {service.db_endpoint || service.db_cluster_identifier || "Provisioning..."}
                        </div>
                    )}
                </div>
            </div>

            {/* Invisible handles for future edge support */}
            <Handle type="source" position={Position.Right} className="!bg-transparent !border-none !w-0 !h-0" />
            <Handle type="target" position={Position.Left} className="!bg-transparent !border-none !w-0 !h-0" />
        </Card>
    )
})
