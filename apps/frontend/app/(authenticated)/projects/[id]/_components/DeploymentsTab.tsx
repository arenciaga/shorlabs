import {
    Clock,
    GitBranch,
    CheckCircle2,
    XCircle,
    Loader2,
} from "lucide-react"
import { DeploymentLogs } from "@/components/DeploymentLogs"
import type { Deployment, ProjectCompat } from "./types"

interface DeploymentsTabProps {
    project: ProjectCompat
    deployments: Deployment[]
    expandedDeployId: string | null
    onToggleExpand: (deployId: string | null) => void
    orgId: string
    onDeployComplete: () => void
}

export function DeploymentsTab({
    project,
    deployments,
    expandedDeployId,
    onToggleExpand,
    orgId,
    onDeployComplete,
}: DeploymentsTabProps) {
    return (
        <div className="bg-zinc-50 rounded-none border border-zinc-200 overflow-hidden">
            {deployments.length === 0 ? (
                <div className="text-center py-16">
                    <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-4">
                        <Clock className="h-6 w-6 text-zinc-400" />
                    </div>
                    <p className="text-zinc-500">No deployments yet</p>
                </div>
            ) : (
                <div className="divide-y divide-zinc-100">
                    {deployments.map((deployment, index) => {
                        const isLatest = index === 0
                        const isExpanded = expandedDeployId === deployment.deploy_id
                        return (
                            <div key={deployment.deploy_id}>
                                <div
                                    onClick={() => onToggleExpand(isExpanded ? null : deployment.deploy_id)}
                                    className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 hover:bg-zinc-50 transition-colors cursor-pointer"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            {deployment.commit_sha ? (
                                                <>
                                                    <GitBranch className="h-3.5 w-3.5 text-zinc-400 flex-shrink-0" />
                                                    {deployment.branch && (
                                                        <span className="text-xs font-medium text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded">
                                                            {deployment.branch}
                                                        </span>
                                                    )}
                                                    <a
                                                        href={`https://github.com/${project.github_repo}/commit/${deployment.commit_sha}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="font-mono text-sm font-medium text-blue-600 hover:underline"
                                                    >
                                                        {deployment.commit_sha.slice(0, 7)}
                                                    </a>
                                                </>
                                            ) : (
                                                <p className="font-mono text-sm font-medium text-zinc-900">
                                                    {deployment.deploy_id}
                                                </p>
                                            )}
                                            {isLatest && (
                                                <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
                                                    Current
                                                </span>
                                            )}
                                        </div>
                                        {deployment.commit_message && (
                                            <p className="text-sm text-zinc-700 mt-0.5 truncate">
                                                {deployment.commit_message.split("\n")[0].slice(0, 60)}
                                                {deployment.commit_message.split("\n")[0].length > 60 ? "..." : ""}
                                            </p>
                                        )}
                                        <p className="text-xs text-zinc-400 mt-0.5">
                                            {new Date(deployment.started_at).toLocaleDateString("en-US", {
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                            {deployment.commit_author_name && (
                                                <span> by {deployment.commit_author_name}</span>
                                            )}
                                        </p>
                                    </div>

                                    <div className={`
                                    text-xs font-medium px-3 py-1.5 rounded-full
                                    ${deployment.status === "SUCCEEDED" ? "text-emerald-700 bg-emerald-50" : ""}
                                    ${deployment.status === "FAILED" ? "text-red-700 bg-red-50" : ""}
                                    ${deployment.status === "IN_PROGRESS" ? "text-blue-900 bg-blue-50" : ""}
                                `}>
                                        {deployment.status === "SUCCEEDED" && "Ready"}
                                        {deployment.status === "FAILED" && "Failed"}
                                        {deployment.status === "IN_PROGRESS" && "Building"}
                                    </div>
                                </div>

                                {/* Expandable Build Logs */}
                                {isExpanded && (
                                    <DeploymentLogs
                                        projectId={project.project_id}
                                        deployId={deployment.deploy_id}
                                        buildId={deployment.build_id}
                                        orgId={orgId}
                                        status={deployment.status}
                                        isExpanded={true}
                                        onToggle={() => onToggleExpand(null)}
                                        onComplete={() => onDeployComplete()}
                                    />
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
