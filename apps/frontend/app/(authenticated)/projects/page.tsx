"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth, useClerk } from "@clerk/nextjs"
import { Plus, Search, ExternalLink, Github, AlertCircle, Folder, Sparkles } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { UpgradeModal, useUpgradeModal } from "@/components/upgrade-modal"
import { useUsage } from "@/hooks/use-usage"
import { useIsPro } from "@/hooks/use-is-pro"
import { trackEvent } from "@/lib/amplitude"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

interface Project {
    project_id: string
    name: string
    github_url: string
    github_repo: string
    status: string
    function_url: string | null
    custom_url: string | null
    subdomain: string | null
    created_at: string
    updated_at: string
}

const STATUS_CONFIG: Record<string, { dot: string; label: string; bg: string }> = {
    PENDING: { dot: "bg-zinc-400", label: "Queued", bg: "bg-zinc-50" },
    CLONING: { dot: "bg-blue-500 animate-pulse", label: "Cloning", bg: "bg-blue-50" },
    PREPARING: { dot: "bg-blue-500 animate-pulse", label: "Preparing", bg: "bg-blue-50" },
    UPLOADING: { dot: "bg-blue-500 animate-pulse", label: "Uploading", bg: "bg-blue-50" },
    BUILDING: { dot: "bg-blue-900 animate-pulse", label: "Building", bg: "bg-blue-50" },
    DEPLOYING: { dot: "bg-blue-900 animate-pulse", label: "Deploying", bg: "bg-blue-50" },
    LIVE: { dot: "bg-emerald-500", label: "Ready", bg: "bg-emerald-50" },
    FAILED: { dot: "bg-red-500", label: "Error", bg: "bg-red-50" },
}

export default function ProjectsPage() {
    const { getToken, isLoaded, orgId } = useAuth()
    const { isPro, proProduct } = useIsPro()
    const { signOut } = useClerk()
    const [searchQuery, setSearchQuery] = useState("")
    const [projects, setProjects] = useState<Project[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const { isOpen: upgradeOpen, openUpgradeModal, closeUpgradeModal } = useUpgradeModal()

    // Fetch real usage metrics with tier-appropriate limits
    const { usage, loading: usageLoading, error: usageError, isValidating } = useUsage()

    const fetchProjects = useCallback(async () => {
        try {
            const token = await getToken({ skipCache: true })
            if (!token) {
                signOut({ redirectUrl: "/sign-in" })
                return
            }

            const url = new URL(`${API_BASE_URL}/api/projects`)
            if (orgId) {
                url.searchParams.append("org_id", orgId)
            }

            const response = await fetch(url.toString(), {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })

            if (!response.ok) {
                const data = await response.json()
                if (response.status === 401 && data.detail === "Token expired") {
                    signOut({ redirectUrl: "/sign-in" })
                    return
                }
                throw new Error(data.detail || "Failed to fetch projects")
            }

            const data = await response.json()
            setProjects(data)
            setError(null)
        } catch (err) {
            console.error("Failed to fetch projects:", err)
            setError(err instanceof Error ? err.message : "Failed to fetch projects")
        } finally {
            setLoading(false)
        }
    }, [getToken, signOut, orgId])

    useEffect(() => {
        if (isLoaded && orgId) {
            fetchProjects()
        }
    }, [isLoaded, orgId, fetchProjects])

    useEffect(() => {
        const hasInProgress = projects.some(p =>
            !["LIVE", "FAILED"].includes(p.status)
        )
        if (!hasInProgress) return
        const interval = setInterval(fetchProjects, 5000)
        return () => clearInterval(interval)
    }, [projects, fetchProjects])

    const filteredProjects = projects.filter((project) =>
        project.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const formatNumber = (num: number) => {
        if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
        if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
        return num.toString()
    }

    return (
        <div className="min-h-screen bg-zinc-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                {/* Page Header */}
                <div className="mb-8">
                    <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight mb-1 flex items-center gap-2">
                        Projects
                        {isPro && (
                            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-blue-900 text-white rounded-full">
                                {proProduct?.status === "trialing" ? "Pro Trial" : "Pro"}
                            </span>
                        )}
                    </h1>
                    <p className="text-zinc-500 text-sm">Deploy and manage your applications</p>
                </div>

                {/* Search & Actions Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-6 sm:mb-8">
                    <div className="relative flex-1 sm:max-w-md">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                        <Input
                            type="text"
                            placeholder="Search Projects..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-10 text-sm bg-white border-zinc-200 rounded-lg w-full focus:ring-2 focus:ring-zinc-100 focus:border-zinc-300 transition-all"
                        />
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Button
                            onClick={() => {
                                trackEvent('Upgrade Button Clicked', {
                                    source: 'projects_page',
                                    user_tier: 'free'
                                })
                                openUpgradeModal()
                            }}
                            variant="outline"
                            className="rounded-full h-10 px-4 sm:px-5 border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-sm font-medium cursor-pointer transition-all flex-1 sm:flex-none"
                        >
                            <Sparkles className="h-4 w-4 mr-2" />
                            Upgrade
                        </Button>
                        <Link href="/new" className="flex-1 sm:flex-none">
                            <Button className="rounded-full h-10 px-4 sm:px-5 bg-zinc-900 text-white hover:bg-zinc-800 text-sm font-medium cursor-pointer transition-all hover:shadow-lg hover:shadow-zinc-900/10 w-full">
                                <Plus className="h-4 w-4 mr-2" />
                                New Project
                            </Button>
                        </Link>
                    </div>
                </div>

                {/* Upgrade Modal */}
                <UpgradeModal isOpen={upgradeOpen} onClose={closeUpgradeModal} />

                {/* Main Layout: Usage Sidebar + Projects Grid */}
                <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
                    {/* Usage Panel - Shows above projects on mobile/tablet, sidebar on desktop */}
                    <div className="w-full lg:w-80 lg:shrink-0">
                        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden sticky top-8">
                            {/* Usage Header */}
                            <div className="px-5 py-4 border-b border-zinc-100">
                                <h2 className="font-semibold text-zinc-900">Usage</h2>
                                <p className="text-xs text-zinc-500">
                                    {usage?.period || 'Current period'}
                                </p>
                            </div>

                            {/* Loading State - show skeleton while loading or validating with no data */}
                            {(usageLoading || (isValidating && !usage)) ? (
                                <div className="divide-y divide-zinc-100 animate-pulse">
                                    <div className="px-5 py-4">
                                        <div className="h-4 bg-zinc-200 rounded w-3/4 mb-2"></div>
                                        <div className="h-1 bg-zinc-200 rounded-full"></div>
                                    </div>
                                    <div className="px-5 py-4">
                                        <div className="h-4 bg-zinc-200 rounded w-3/4 mb-2"></div>
                                        <div className="h-1 bg-zinc-200 rounded-full"></div>
                                    </div>
                                </div>
                            ) : usageError && !usage ? (
                                /* Error State - only show if we have NO data at all */
                                <div className="px-5 py-6 text-center">
                                    <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                                    <p className="text-sm text-zinc-600 mb-2">Failed to load usage</p>
                                    <p className="text-xs text-zinc-400">{usageError.message}</p>
                                </div>
                            ) : (
                                /* Usage Items */
                                <>
                                    <div className="divide-y divide-zinc-100">
                                        {/* Total Requests */}
                                        <div className="px-5 py-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-zinc-900" />
                                                    <span className="text-sm text-zinc-600">Requests</span>
                                                </div>
                                                <span className="text-sm font-mono text-zinc-500">
                                                    {formatNumber(usage?.requests.current || 0)} / {formatNumber(usage?.requests.limit || 0)}
                                                </span>
                                            </div>
                                            <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-zinc-900 rounded-full"
                                                    style={{ width: `${Math.min(((usage?.requests.current || 0) / (usage?.requests.limit || 1)) * 100, 100)}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* GB-Seconds */}
                                        <div className="px-5 py-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-zinc-900" />
                                                    <span className="text-sm text-zinc-600">Compute (GB-Seconds)</span>
                                                </div>
                                                <span className="text-sm font-mono text-zinc-500">
                                                    {formatNumber(usage?.gbSeconds.current || 0)} / {formatNumber(usage?.gbSeconds.limit || 0)}
                                                </span>
                                            </div>
                                            <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-zinc-900 rounded-full"
                                                    style={{ width: `${Math.min(((usage?.gbSeconds.current || 0) / (usage?.gbSeconds.limit || 1)) * 100, 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Last Updated */}
                                    {usage?.lastUpdated && (
                                        <div className="px-5 py-2 bg-zinc-50 border-t border-zinc-100">
                                            <p className="text-[10px] text-zinc-400 text-center">
                                                Updated {new Date(usage.lastUpdated).toLocaleTimeString()}
                                            </p>
                                        </div>
                                    )}
                                </>
                            )}

                            {!isPro && (
                                <button
                                    onClick={openUpgradeModal}
                                    className="w-full px-5 py-3 border-t border-zinc-100 text-left hover:bg-zinc-50 transition-colors cursor-pointer"
                                >
                                    <p className="text-xs text-blue-600 hover:underline">
                                        Upgrade to increase limits →
                                    </p>
                                </button>
                            )}


                        </div>
                    </div>

                    {/* Right Side - Projects */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="font-medium text-zinc-900">Projects</h2>
                        </div>

                        {/* Loading State */}
                        {loading ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {[...Array(4)].map((_, i) => (
                                    <div
                                        key={i}
                                        className="bg-white border border-zinc-200 rounded-xl overflow-hidden"
                                    >
                                        <div className="p-5 pb-4">
                                            <div className="flex items-start justify-between mb-4">
                                                <div className="h-5 w-32 bg-gradient-to-r from-zinc-200 via-zinc-100 to-zinc-200 rounded bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]" />
                                                <div className="h-6 w-16 bg-zinc-100 rounded-full" />
                                            </div>
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className="h-4 w-4 rounded bg-zinc-200" />
                                                <div className="h-4 w-36 bg-gradient-to-r from-zinc-200 via-zinc-100 to-zinc-200 rounded bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]" />
                                            </div>
                                        </div>
                                        <div className="px-5 py-3 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between">
                                            <div className="h-3 w-20 bg-zinc-200 rounded" />
                                            <div className="h-6 w-6 bg-zinc-200 rounded" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : error ? (
                            <div className="text-center py-20">
                                <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                                    <AlertCircle className="h-6 w-6 text-red-500" />
                                </div>
                                <p className="text-zinc-900 font-medium mb-2">Failed to load projects</p>
                                <p className="text-sm text-zinc-500 mb-6">{error}</p>
                                <Button onClick={fetchProjects} variant="outline" className="rounded-full">
                                    Try Again
                                </Button>
                            </div>
                        ) : filteredProjects.length > 0 ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {filteredProjects.map((project) => {
                                    const status = STATUS_CONFIG[project.status] || STATUS_CONFIG.PENDING
                                    return (
                                        <Link
                                            key={project.project_id}
                                            href={`/projects/${project.project_id}`}
                                            className="group block"
                                        >
                                            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden transition-all duration-200 hover:border-zinc-300 hover:shadow-lg hover:shadow-zinc-200/50">
                                                <div className="p-5 pb-4">
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-9 h-9 rounded-lg bg-zinc-900 flex items-center justify-center shrink-0">
                                                                <span className="text-white font-semibold text-sm">
                                                                    {project.name.charAt(0).toUpperCase()}
                                                                </span>
                                                            </div>
                                                            <div className="min-w-0">
                                                                <h3 className="font-semibold text-zinc-900 group-hover:text-black transition-colors truncate">
                                                                    {project.name.toLowerCase().replace(/_/g, '-')}
                                                                </h3>
                                                                {(project.custom_url || project.function_url) && (
                                                                    <p className="text-xs text-zinc-500 truncate">
                                                                        {(project.custom_url || project.function_url)!.replace("https://", "").split("/")[0]}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full shrink-0 ${status.bg}`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                                                            <span className="text-xs font-medium text-zinc-700">
                                                                {status.label}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                                                        <Github className="h-4 w-4 shrink-0" />
                                                        <span className="truncate text-xs">{project.github_repo}</span>
                                                    </div>
                                                </div>

                                                <div className="px-5 py-3 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between">
                                                    <span className="text-xs text-zinc-400">
                                                        {new Date(project.updated_at || project.created_at).toLocaleDateString("en-US", {
                                                            month: "short",
                                                            day: "numeric",
                                                            year: "numeric",
                                                        })}
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault()
                                                                e.stopPropagation()
                                                                window.open(`https://github.com/${project.github_repo}`, "_blank")
                                                            }}
                                                            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors cursor-pointer"
                                                        >
                                                            <Github className="h-4 w-4" />
                                                        </button>
                                                        {(project.custom_url || project.function_url) && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.preventDefault()
                                                                    e.stopPropagation()
                                                                    window.open((project.custom_url || project.function_url)!, "_blank")
                                                                }}
                                                                className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors cursor-pointer"
                                                            >
                                                                <ExternalLink className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </Link>
                                    )
                                })}
                            </div>
                        ) : searchQuery ? (
                            <div className="text-center py-20">
                                <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-4">
                                    <Search className="h-6 w-6 text-zinc-400" />
                                </div>
                                <p className="text-zinc-900 font-medium mb-2">No results found</p>
                                <p className="text-sm text-zinc-500 mb-6">
                                    No projects match &quot;{searchQuery}&quot;
                                </p>
                                <Button
                                    onClick={() => setSearchQuery("")}
                                    variant="outline"
                                    className="rounded-full"
                                >
                                    Clear Search
                                </Button>
                            </div>
                        ) : (
                            <div className="text-center py-20">
                                <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto mb-6 rotate-3">
                                    <Folder className="h-8 w-8 text-zinc-400" />
                                </div>
                                <h2 className="text-xl font-semibold text-zinc-900 mb-2">No projects yet</h2>
                                <p className="text-sm text-zinc-500 mb-8 max-w-sm mx-auto">
                                    Get started by creating your first project. Connect a GitHub repo and deploy in minutes.
                                </p>
                                <Link href="/new">
                                    <Button className="rounded-full h-11 px-6 bg-zinc-900 text-white hover:bg-zinc-800 text-sm font-medium cursor-pointer transition-all hover:shadow-lg hover:shadow-zinc-900/10">
                                        <Plus className="h-4 w-4 mr-2" />
                                        Create Your First Project
                                    </Button>
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
