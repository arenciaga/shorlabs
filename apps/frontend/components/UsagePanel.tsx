"use client"

import { AlertCircle } from "lucide-react"
import { useUsage } from "@/hooks/use-usage"
import { useIsPro } from "@/hooks/use-is-pro"

interface UsagePanelProps {
    onUpgrade: () => void
}

const formatNumber = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
    return num.toString()
}

export function UsagePanel({ onUpgrade }: UsagePanelProps) {
    const { usage, loading: usageLoading, error: usageError, isValidating } = useUsage()
    const { isPro } = useIsPro()

    return (
        <div className="w-full lg:w-80 lg:shrink-0">
            <div className="sticky top-8 border border-zinc-200 rounded-xl bg-white overflow-hidden">
                {/* Header row */}
                <div className="flex items-center justify-between px-5 pt-5 pb-1">
                    <div>
                        <h3 className="text-sm font-semibold text-zinc-900">Usage</h3>
                        <p className="text-xs text-zinc-400 mt-0.5">
                            {usage?.periodStart && usage?.periodEnd
                                ? `${new Date(usage.periodStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(usage.periodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                                : "Current period"}
                        </p>
                    </div>
                    {(usageLoading || isValidating) && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-zinc-300 animate-pulse" />
                            Syncing
                        </span>
                    )}
                </div>

                {/* Body */}
                <div className="px-5 pt-4 pb-5">
                    {(usageLoading || (isValidating && !usage)) ? (
                        <div className="space-y-5 animate-pulse">
                            <div className="space-y-2.5">
                                <div className="flex justify-between">
                                    <div className="h-3 bg-zinc-100 rounded w-24" />
                                    <div className="h-3 bg-zinc-100 rounded w-16" />
                                </div>
                                <div className="h-2 bg-zinc-100 rounded-full" />
                            </div>
                            <div className="space-y-2.5">
                                <div className="flex justify-between">
                                    <div className="h-3 bg-zinc-100 rounded w-20" />
                                    <div className="h-3 bg-zinc-100 rounded w-16" />
                                </div>
                                <div className="h-2 bg-zinc-100 rounded-full" />
                            </div>
                        </div>
                    ) : usageError && !usage ? (
                        <div className="py-6 text-center">
                            <AlertCircle className="h-5 w-5 text-red-400 mx-auto mb-2" />
                            <p className="text-sm text-zinc-600">Failed to load usage</p>
                            <p className="text-xs text-zinc-400 mt-0.5">{usageError.message}</p>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {/* Included Requests */}
                            <div>
                                <div className="flex items-baseline justify-between mb-2">
                                    <span className="text-[13px] text-zinc-600">Included Requests</span>
                                    <span className="text-[13px] tabular-nums text-zinc-900">
                                        {formatNumber(usage?.requests.current || 0)}
                                        <span className="text-zinc-400"> / {formatNumber(usage?.requests.limit || 0)}</span>
                                    </span>
                                </div>
                                <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out"
                                        style={{
                                            width: `${Math.min(
                                                ((usage?.requests.current || 0) /
                                                    (usage?.requests.limit || 1)) *
                                                100,
                                                100
                                            )}%`,
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Included Compute */}
                            <div>
                                <div className="flex items-baseline justify-between mb-2">
                                    <span className="text-[13px] text-zinc-600">Included Compute</span>
                                    <span className="text-[13px] tabular-nums text-zinc-900">
                                        {formatNumber(usage?.gbSeconds.current || 0)}
                                        <span className="text-zinc-400"> / {formatNumber(usage?.gbSeconds.limit || 0)}</span>
                                    </span>
                                </div>
                                <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out"
                                        style={{
                                            width: `${Math.min(
                                                ((usage?.gbSeconds.current || 0) /
                                                    (usage?.gbSeconds.limit || 1)) *
                                                100,
                                                100
                                            )}%`,
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer — only show upgrade CTA for non-pro users */}
                {!isPro && (
                    <div className="border-t border-zinc-100 px-5 py-3">
                        <button
                            onClick={onUpgrade}
                            className="w-full text-center text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
                        >
                            Upgrade to increase limits →
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
