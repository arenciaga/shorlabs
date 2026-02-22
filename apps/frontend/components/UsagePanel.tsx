"use client"

import { useEffect, useState } from "react"
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

const formatDollars = (amount: number) => {
    return `$${amount.toFixed(2)}`
}

export function UsagePanel({ onUpgrade }: UsagePanelProps) {
    const { usage, loading: usageLoading, error: usageError, isValidating } = useUsage()
    const { isPro, planLabel } = useIsPro()
    const [mounted, setMounted] = useState(false)
    useEffect(() => { setMounted(true) }, [])

    // Don't render anything meaningful until mounted (prevents hydration mismatch)
    // and until we have data (prevents showing wrong layout)
    const dataReady = mounted && !usageLoading && usage != null
    // Critical banner only when data is confirmed (not revalidating), per SWR stale-while-revalidate UX
    const dataConfirmed = dataReady && !isValidating
    const hasCredits = dataReady && usage.credits != null
    const showLoading = !mounted || usageLoading || (isValidating && !usage)

    return (
        <div className="w-full lg:w-80 lg:shrink-0">
            <div className="sticky top-8 border border-zinc-200 rounded-none bg-white overflow-hidden">
                {/* Header row */}
                <div className="flex items-center justify-between px-5 pt-5 pb-1">
                    <div>
                        <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                            Usage
                            {mounted && isPro && (
                                <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded-full">
                                    {planLabel}
                                </span>
                            )}
                        </h3>
                        <p className="text-xs text-zinc-400 mt-0.5">
                            {dataReady && usage.periodStart && usage.periodEnd
                                ? `${new Date(usage.periodStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(usage.periodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                                : "Current period"}
                        </p>
                    </div>
                    {mounted && (usageLoading || isValidating) && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-zinc-300 animate-pulse" />
                            Syncing
                        </span>
                    )}
                </div>

                {/* Quota Exceeded Banner — only when confirmed (not revalidating) to avoid flash from stale cache */}
                {dataConfirmed && usage.isThrottled && (
                    <div className="mx-4 mt-3 rounded-none bg-red-50 border border-red-200 p-3">
                        <div className="flex items-start gap-2.5">
                            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-xs font-medium text-red-900">
                                    Quota exceeded
                                </p>
                                <p className="text-[11px] text-red-700 mt-0.5">
                                    Your projects are paused. Upgrade to restore service.
                                </p>
                                <button
                                    onClick={onUpgrade}
                                    className="mt-1.5 text-[11px] font-medium text-red-700 hover:text-red-900 underline underline-offset-2 cursor-pointer"
                                >
                                    Upgrade now
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Body */}
                <div className="px-5 pt-4 pb-5">
                    {showLoading ? (
                        /* ── Loading skeleton ──────────────────────── */
                        <div className="space-y-5 animate-pulse">
                            <div className="space-y-2.5">
                                <div className="flex justify-between">
                                    <div className="h-3 bg-zinc-100 rounded w-24" />
                                    <div className="h-3 bg-zinc-100 rounded w-16" />
                                </div>
                                <div className="h-2.5 bg-zinc-100 rounded-full" />
                            </div>
                        </div>
                    ) : usageError && !usage ? (
                        /* ── Error state ───────────────────────────── */
                        <div className="py-6 text-center">
                            <AlertCircle className="h-5 w-5 text-red-400 mx-auto mb-2" />
                            <p className="text-sm text-zinc-600">Failed to load usage</p>
                            <p className="text-xs text-zinc-400 mt-0.5">{usageError.message}</p>
                        </div>
                    ) : hasCredits ? (
                        /* ── Pro: Credit-based display ─────────────── */
                        <div className="space-y-4">
                            {/* Dollar amount + progress bar */}
                            <div>
                                <div className="flex items-baseline justify-between mb-1">
                                    <span className="text-[13px] text-zinc-500">Included Credit</span>
                                    <span className="text-[13px] text-zinc-500">Overage</span>
                                </div>
                                <div className="flex items-baseline justify-between mb-2">
                                    <span className="text-lg font-semibold tabular-nums text-zinc-900">
                                        {formatDollars(usage!.credits!.used)}
                                        <span className="text-sm font-normal text-zinc-400">
                                            {" "}/ {formatDollars(usage!.credits!.included)}
                                        </span>
                                    </span>
                                    <span className="text-sm tabular-nums font-medium text-zinc-900">
                                        {usage!.credits!.used > usage!.credits!.included
                                            ? formatDollars(usage!.credits!.used - usage!.credits!.included)
                                            : "—"}
                                    </span>
                                </div>
                                <div className="h-2.5 rounded-full bg-zinc-100 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ease-out ${usage!.credits!.used > usage!.credits!.included
                                                ? "bg-amber-500"
                                                : "bg-blue-600"
                                            }`}
                                        style={{
                                            width: `${Math.min(
                                                (usage!.credits!.used / (usage!.credits!.included || 1)) * 100,
                                                100
                                            )}%`,
                                        }}
                                    />
                                </div>
                            </div>

                        </div>
                    ) : dataReady ? (
                        /* ── Hobby: Raw count display ──────────────── */
                        <div className="space-y-5">
                            {/* Included Requests */}
                            <div>
                                <div className="flex items-baseline justify-between mb-2">
                                    <span className="text-[13px] text-zinc-600">Included Requests</span>
                                    <span className="text-[13px] tabular-nums text-zinc-900">
                                        {formatNumber(usage!.requests.current || 0)}
                                        <span className="text-zinc-400"> / {formatNumber(usage!.requests.limit || 0)}</span>
                                    </span>
                                </div>
                                <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ease-out ${
                                            usage!.requests.limit && (usage!.requests.current || 0) > usage!.requests.limit
                                                ? "bg-red-500"
                                                : "bg-blue-600"
                                        }`}
                                        style={{
                                            width: `${Math.min(
                                                ((usage!.requests.current || 0) /
                                                    (usage!.requests.limit || 1)) *
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
                                        {formatNumber(usage!.gbSeconds.current || 0)}
                                        <span className="text-zinc-400"> / {formatNumber(usage!.gbSeconds.limit || 0)}</span>
                                    </span>
                                </div>
                                <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ease-out ${
                                            usage!.gbSeconds.limit && (usage!.gbSeconds.current || 0) > usage!.gbSeconds.limit
                                                ? "bg-red-500"
                                                : "bg-blue-600"
                                        }`}
                                        style={{
                                            width: `${Math.min(
                                                ((usage!.gbSeconds.current || 0) /
                                                    (usage!.gbSeconds.limit || 1)) *
                                                100,
                                                100
                                            )}%`,
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>

                {/* Footer — only show upgrade CTA for non-pro users */}
                {mounted && !isPro && (
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
