import {
    Globe,
    ExternalLink,
    Copy,
    Check,
    Activity,
    CheckCircle2,
    XCircle,
    Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Deployment, Project } from "./types"

interface StatsCardsProps {
    project: Project
    displayUrl: string | null
    latestDeployment: Deployment | undefined
    copied: boolean
    onCopy: (text: string) => void
}

export function StatsCards({ project, displayUrl, latestDeployment, copied, onCopy }: StatsCardsProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 sm:mb-8">
            {/* Production URL */}
            <div className="md:col-span-2 bg-zinc-50 rounded-none border border-zinc-200 p-4 sm:p-5 ">
                <div className="flex items-center gap-2 text-zinc-500 mb-3">
                    <Globe className="h-4 w-4" />
                    <span className="text-xs font-medium uppercase tracking-wider">Production</span>
                </div>
                {displayUrl ? (
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="flex-1 min-w-0 bg-zinc-50 rounded-none px-3 sm:px-4 py-3 font-mono text-xs sm:text-sm text-zinc-700 border border-zinc-100 truncate">
                            {displayUrl.replace("https://", "")}
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onCopy(displayUrl)}
                            className="h-9 w-9 sm:h-10 sm:w-10 rounded-none hover:bg-zinc-100 shrink-0"
                        >
                            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                        <a href={displayUrl} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-10 sm:w-10 rounded-none hover:bg-zinc-100 shrink-0">
                                <ExternalLink className="h-4 w-4" />
                            </Button>
                        </a>
                    </div>
                ) : (
                    <div className="text-zinc-400 text-sm">Deploying...</div>
                )}
            </div>

            {/* Last Deployment */}
            <div className="bg-zinc-50 rounded-none border border-zinc-200 p-4 sm:p-5 ">
                <div className="flex items-center gap-2 text-zinc-500 mb-3">
                    <Activity className="h-4 w-4" />
                    <span className="text-xs font-medium uppercase tracking-wider">Last Deploy</span>
                </div>
                {latestDeployment ? (
                    <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                            {latestDeployment.commit_sha ? (
                                <>
                                    <div className="flex items-center gap-1.5">
                                        {latestDeployment.branch && (
                                            <span className="text-xs font-medium text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded">
                                                {latestDeployment.branch}
                                            </span>
                                        )}
                                        <a
                                            href={`https://github.com/${project.github_repo}/commit/${latestDeployment.commit_sha}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-mono text-sm text-blue-600 hover:underline"
                                        >
                                            {latestDeployment.commit_sha.slice(0, 7)}
                                        </a>
                                    </div>
                                    {latestDeployment.commit_message && (
                                        <p className="text-xs text-zinc-500 mt-1 truncate">
                                            {latestDeployment.commit_message.split("\n")[0].slice(0, 50)}
                                            {latestDeployment.commit_message.split("\n")[0].length > 50 ? "..." : ""}
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p className="font-mono text-sm text-zinc-700">{latestDeployment.deploy_id}</p>
                            )}
                            <p className="text-xs text-zinc-400 mt-1">
                                {new Date(latestDeployment.started_at).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </p>
                        </div>
                        {latestDeployment.status === "SUCCEEDED" && <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />}
                        {latestDeployment.status === "FAILED" && <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />}
                        {latestDeployment.status === "IN_PROGRESS" && <Loader2 className="h-5 w-5 text-blue-900 animate-spin flex-shrink-0" />}
                    </div>
                ) : (
                    <div className="text-zinc-400 text-sm">No deployments</div>
                )}
            </div>
        </div>
    )
}
