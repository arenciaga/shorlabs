"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useUser, useAuth, useClerk } from "@clerk/nextjs"
import { useRouter, useSearchParams } from "next/navigation"
import { Github, Search, ArrowLeft, Lock, Globe, Loader2, AlertCircle, GitBranch, ArrowUpRight, RefreshCw, Settings } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useIsPro } from "@/hooks/use-is-pro"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

interface GitHubRepo {
    id: number
    name: string
    full_name: string
    private: boolean
    language: string | null
    updated_at: string
}

type PageState =
    | { status: 'initializing' }
    | { status: 'checking_connection' }
    | { status: 'not_connected' }
    | { status: 'loading_repos' }
    | { status: 'ready'; repos: GitHubRepo[] }
    | { status: 'error'; message: string }

const LANGUAGE_COLORS: Record<string, string> = {
    TypeScript: "bg-blue-500",
    JavaScript: "bg-yellow-400",
    Python: "bg-emerald-500",
    Rust: "bg-orange-500",
    Go: "bg-cyan-500",
    Java: "bg-red-500",
    Ruby: "bg-red-400",
    PHP: "bg-indigo-400",
    Swift: "bg-orange-400",
    Kotlin: "bg-purple-500",
    C: "bg-gray-500",
    "C++": "bg-pink-500",
    "C#": "bg-green-600",
}

function ImportRepositoryPageInner() {
    const router = useRouter()
    const { user, isLoaded: userLoaded } = useUser()
    const { getToken, orgId } = useAuth()
    const { signOut } = useClerk()
    const searchParams = useSearchParams()
    const { isPro, isLoaded: isPlanLoaded } = useIsPro()

    const [pageState, setPageState] = useState<PageState>({ status: 'initializing' })
    const [searchQuery, setSearchQuery] = useState("")

    // Redirect hobby users back to /new
    useEffect(() => {
        if (isPlanLoaded && !isPro) {
            router.replace("/new")
        }
    }, [isPlanLoaded, isPro, router])

    const initializePage = useCallback(async () => {
        if (!userLoaded || !orgId) {
            setPageState({ status: 'initializing' })
            return
        }

        if (!user) return

        setPageState({ status: 'checking_connection' })

        try {
            const token = await getToken()
            if (!token) {
                signOut({ redirectUrl: "/sign-in" })
                return
            }

            const statusUrl = new URL(`${API_BASE_URL}/api/github/status`)
            if (orgId) statusUrl.searchParams.append("org_id", orgId)
            const statusRes = await fetch(statusUrl.toString(), {
                headers: { Authorization: `Bearer ${token}` }
            })

            if (!statusRes.ok) throw new Error('Failed to check connection status')

            const statusData = await statusRes.json()

            if (!statusData.connected) {
                setPageState({ status: 'not_connected' })
                return
            }

            setPageState({ status: 'loading_repos' })

            const reposUrl = new URL(`${API_BASE_URL}/api/github/repos`)
            if (orgId) reposUrl.searchParams.append("org_id", orgId)
            const reposRes = await fetch(reposUrl.toString(), {
                headers: { Authorization: `Bearer ${token}` }
            })

            if (!reposRes.ok) {
                const data = await reposRes.json()
                if (reposRes.status === 401 && data.detail === "Token expired") {
                    signOut({ redirectUrl: "/sign-in" })
                    return
                }
                throw new Error(data.detail || 'Failed to fetch repositories')
            }

            const repos = await reposRes.json()
            setPageState({ status: 'ready', repos })

        } catch (err) {
            console.error("Page initialization failed:", err)
            setPageState({
                status: 'error',
                message: err instanceof Error ? err.message : 'Something went wrong'
            })
        }
    }, [userLoaded, user, getToken, signOut, orgId])

    useEffect(() => {
        initializePage()
    }, [initializePage])

    const handleImport = (repo: GitHubRepo) => {
        const base = `/new/web-service/configure?repo=${encodeURIComponent(repo.full_name)}&private=${repo.private}`
        const existingProjectId = searchParams.get("project_id")
        router.push(existingProjectId ? `${base}&project_id=${existingProjectId}` : base)
    }

    const repos = pageState.status === 'ready' ? pageState.repos : []
    const filteredRepos = repos.filter(repo =>
        repo.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        repo.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const formatRelativeTime = (dateString: string) => {
        const date = new Date(dateString)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
        const diffDays = Math.floor(diffHours / 24)

        if (diffHours < 1) return "just now"
        if (diffHours < 24) return `${diffHours}h ago`
        if (diffDays < 7) return `${diffDays}d ago`
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    }

    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
                {/* Navigation */}
                <Link
                    href={searchParams.get("project_id") ? `/new?project_id=${searchParams.get("project_id")}` : "/new"}
                    className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors mb-8 group"
                >
                    <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                    <span>Back to Project Type</span>
                </Link>

                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Import Repository</h1>
                    <p className="text-sm text-zinc-500 mt-1">Select a Git repository to deploy as a web service</p>
                </div>

                {/* Main Content */}
                {(pageState.status === 'initializing' || pageState.status === 'checking_connection') ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                    </div>
                ) : pageState.status === 'error' ? (
                    pageState.message.toLowerCase().includes('token') ||
                        pageState.message.toLowerCase().includes('expired') ||
                        pageState.message.toLowerCase().includes('invalid') ||
                        pageState.message.toLowerCase().includes('reconnect') ? (
                        // GitHub connection issue - direct to settings
                        <div className="bg-white rounded-none border border-zinc-200 p-12 text-center hover:shadow-lg hover:shadow-zinc-900/5 transition-shadow">
                            <div className="w-16 h-16 rounded-none bg-zinc-900 flex items-center justify-center mx-auto mb-6">
                                <Github className="h-8 w-8 text-white" />
                            </div>
                            <h2 className="text-xl font-semibold text-zinc-900 mb-2">GitHub Connection Issue</h2>
                            <p className="text-sm text-zinc-500 mb-8 max-w-sm mx-auto">
                                Your GitHub connection needs to be refreshed. Head to Settings to reconnect.
                            </p>
                            <Link href="/settings">
                                <Button className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-full h-12 px-8 shadow-lg shadow-zinc-900/10">
                                    <Settings className="h-5 w-5 mr-2" />
                                    Go to Settings
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        <div className="bg-white rounded-none border border-zinc-200 p-12 text-center">
                            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                                <AlertCircle className="h-6 w-6 text-red-500" />
                            </div>
                            <h2 className="text-lg font-semibold text-zinc-900 mb-2">Something went wrong</h2>
                            <p className="text-sm text-zinc-500 mb-6 max-w-sm mx-auto">{pageState.message}</p>
                            <Button onClick={() => initializePage()} variant="outline" className="rounded-full">
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Try Again
                            </Button>
                        </div>
                    )
                ) : pageState.status === 'not_connected' ? (
                    // Not connected - direct to settings
                    <div className="bg-white rounded-none border border-zinc-200 p-12 text-center hover:shadow-lg hover:shadow-zinc-900/5 transition-shadow">
                        <div className="w-16 h-16 rounded-none bg-zinc-900 flex items-center justify-center mx-auto mb-6">
                            <Github className="h-8 w-8 text-white" />
                        </div>
                        <h2 className="text-xl font-semibold text-zinc-900 mb-2">Connect GitHub</h2>
                        <p className="text-sm text-zinc-500 mb-8 max-w-sm mx-auto">
                            Connect your GitHub account in Settings to import repositories and deploy your projects.
                        </p>
                        <Link href="/settings">
                            <Button className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-full h-12 px-8 shadow-lg shadow-zinc-900/10">
                                <Settings className="h-5 w-5 mr-2" />
                                Go to Settings
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="bg-white rounded-none border border-zinc-200 overflow-hidden hover:shadow-lg hover:shadow-zinc-900/5 transition-shadow">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-zinc-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-none bg-zinc-900 flex items-center justify-center">
                                        <Github className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-zinc-900">
                                            {user?.username || user?.primaryEmailAddress?.emailAddress}
                                        </p>
                                        <p className="text-xs text-zinc-500">GitHub Connected</p>
                                    </div>
                                </div>
                                <a
                                    href="https://github.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors flex items-center gap-1"
                                >
                                    View Profile
                                    <ArrowUpRight className="h-3.5 w-3.5" />
                                </a>
                            </div>

                            <div className="px-4 sm:px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                                    <Input
                                        placeholder="Search repositories..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-11 h-11 bg-white border-zinc-200 rounded-none text-sm focus-visible:ring-zinc-200"
                                    />
                                </div>
                            </div>

                            {pageState.status === 'loading_repos' ? (
                                <div className="divide-y divide-zinc-100">
                                    {[1, 2, 3, 4, 5].map(i => (
                                        <div key={i} className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                                            <div className="w-10 h-10 rounded-none bg-zinc-100 animate-pulse" />
                                            <div className="flex-1">
                                                <div className="h-4 w-40 bg-gradient-to-r from-zinc-200 via-zinc-100 to-zinc-200 rounded bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite] mb-2" />
                                                <div className="h-3 w-24 bg-zinc-100 rounded" />
                                            </div>
                                            <div className="w-20 h-9 bg-zinc-100 rounded-full" />
                                        </div>
                                    ))}
                                </div>
                            ) : filteredRepos.length === 0 ? (
                                <div className="px-4 sm:px-6 py-16 text-center">
                                    <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-4">
                                        <Search className="h-6 w-6 text-zinc-400" />
                                    </div>
                                    <p className="font-medium text-zinc-900 mb-1">No repositories found</p>
                                    <p className="text-sm text-zinc-500">
                                        {searchQuery ? `No results for "${searchQuery}"` : "You don't have any repositories yet"}
                                    </p>
                                </div>
                            ) : (
                                <div className="divide-y divide-zinc-100 max-h-[520px] overflow-y-auto">
                                    {filteredRepos.map((repo) => (
                                        <div
                                            key={repo.id}
                                            className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 hover:bg-zinc-50 transition-colors group"
                                        >
                                            <div className="w-10 h-10 rounded-none bg-zinc-100 flex items-center justify-center shrink-0 relative self-start sm:self-center">
                                                <GitBranch className="h-5 w-5 text-zinc-500" />
                                                {repo.language && LANGUAGE_COLORS[repo.language] && (
                                                    <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${LANGUAGE_COLORS[repo.language]} border-2 border-white`} />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-zinc-900 truncate">{repo.name}</span>
                                                    {repo.private ? (
                                                        <span className="inline-flex items-center gap-1 text-xs text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">
                                                            <Lock className="h-3 w-3" />
                                                            Private
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-xs text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">
                                                            <Globe className="h-3 w-3" />
                                                            Public
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1">
                                                    {repo.language && (
                                                        <>
                                                            <span className="flex items-center gap-1">
                                                                <span className={`w-2 h-2 rounded-full ${LANGUAGE_COLORS[repo.language] || 'bg-zinc-400'}`} />
                                                                {repo.language}
                                                            </span>
                                                            <span className="text-zinc-300">&middot;</span>
                                                        </>
                                                    )}
                                                    <span>Updated {formatRelativeTime(repo.updated_at)}</span>
                                                </div>
                                            </div>
                                            <Button
                                                onClick={() => handleImport(repo)}
                                                variant="outline"
                                                className="rounded-full h-9 px-5 text-sm shrink-0 border-zinc-200 hover:bg-zinc-900 hover:text-white hover:border-zinc-900 transition-all w-full sm:w-auto"
                                            >
                                                Import
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <p className="text-center text-xs text-zinc-400">
                            Don&apos;t see your repository?{" "}
                            <Link
                                href="/settings"
                                className="text-zinc-600 hover:text-zinc-900 underline underline-offset-2"
                            >
                                Manage GitHub permissions in Settings
                            </Link>
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default function ImportRepositoryPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-white flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
        }>
            <ImportRepositoryPageInner />
        </Suspense>
    )
}
