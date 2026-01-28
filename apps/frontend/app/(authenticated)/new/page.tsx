"use client"

import { useState, useEffect, useCallback } from "react"
import { useUser, useAuth, useClerk } from "@clerk/nextjs"
import { useRouter, useSearchParams } from "next/navigation"
import { Github, Search, ArrowLeft, Lock, Globe, Loader2, AlertCircle, GitBranch, ArrowUpRight, RefreshCw } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

interface GitHubRepo {
    id: number
    name: string
    full_name: string
    private: boolean
    language: string | null
    updated_at: string
}

// State machine for page loading states - prevents UI flicker
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

export default function ImportRepositoryPage() {
    const router = useRouter()
    const { user, isLoaded: userLoaded } = useUser()
    const { getToken } = useAuth()
    const { signOut } = useClerk()
    const searchParams = useSearchParams()

    // Single state machine for the entire page
    const [pageState, setPageState] = useState<PageState>({ status: 'initializing' })
    const [searchQuery, setSearchQuery] = useState("")

    // Consolidated initialization function - checks connection AND fetches repos in sequence
    const initializePage = useCallback(async () => {
        if (!userLoaded) {
            setPageState({ status: 'initializing' })
            return
        }

        if (!user) {
            // User not logged in - will be handled by auth middleware
            return
        }

        setPageState({ status: 'checking_connection' })

        try {
            const token = await getToken()
            if (!token) {
                signOut({ redirectUrl: "/sign-in" })
                return
            }

            // Step 1: Check GitHub connection status
            console.log("🔍 Checking GitHub connection...")
            const statusRes = await fetch(`${API_BASE_URL}/api/github/status`, {
                headers: { Authorization: `Bearer ${token}` }
            })

            if (!statusRes.ok) {
                throw new Error('Failed to check connection status')
            }

            const statusData = await statusRes.json()
            console.log("✅ Connection status:", statusData)

            if (!statusData.connected) {
                setPageState({ status: 'not_connected' })
                return
            }

            // Step 2: Connected - now fetch repos before showing connected UI
            setPageState({ status: 'loading_repos' })

            const reposRes = await fetch(`${API_BASE_URL}/api/github/repos`, {
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
            console.error("❌ Page initialization failed:", err)
            setPageState({
                status: 'error',
                message: err instanceof Error ? err.message : 'Something went wrong'
            })
        }
    }, [userLoaded, user, getToken, signOut])

    // Run initialization when dependencies change
    useEffect(() => {
        initializePage()
    }, [initializePage])

    // Handle GitHub App installation callback (in popup)
    const connectGitHub = useCallback(async (installation_id: string, setup_action: string): Promise<boolean> => {
        try {
            const token = await getToken()
            if (!token) {
                throw new Error("No auth token available")
            }

            console.log("📤 Calling /api/github/connect with installation_id:", installation_id)

            const response = await fetch(`${API_BASE_URL}/api/github/connect`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    installation_id,
                    setup_action
                }),
            })

            if (!response.ok) {
                const data = await response.json()
                console.error("GitHub connection error:", data)
                throw new Error(data.detail || "Failed to connect GitHub")
            }

            const result = await response.json()
            console.log("✅ GitHub connected:", result)

            // Only update state if we're NOT in a popup (parent window handles its own state)
            if (!window.opener) {
                router.replace("/new")
                // Re-initialize to load repos
                initializePage()
            }

            return true

        } catch (err) {
            console.error("Failed to connect GitHub:", err)
            if (!window.opener) {
                setPageState({
                    status: 'error',
                    message: err instanceof Error ? err.message : "Failed to connect GitHub. Please try again."
                })
            }
            throw err
        }
    }, [getToken, router, initializePage])

    // Handle GitHub App installation callback from URL params
    useEffect(() => {
        const installation_id = searchParams.get("installation_id")
        const setup_action = searchParams.get("setup_action")

        if (installation_id && userLoaded) {
            console.log("📥 GitHub App installation callback received:", { installation_id, setup_action })

            const handleCallback = async () => {
                try {
                    await connectGitHub(installation_id, setup_action || "install")

                    if (window.opener) {
                        console.log("✅ Connection complete, notifying parent window")
                        window.opener.postMessage({ type: 'github-connected' }, window.location.origin)
                        window.close()
                    }
                } catch (err) {
                    console.error("❌ GitHub connection failed in popup:", err)
                    if (window.opener) {
                        window.opener.postMessage({ type: 'github-connection-failed' }, window.location.origin)
                        window.close()
                    }
                }
            }

            handleCallback()
        }
    }, [searchParams, userLoaded, connectGitHub])

    // Listen for messages from popup window
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return

            if (event.data.type === 'github-connected') {
                // Re-run full initialization to get fresh state and repos
                initializePage()
            }
        }

        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [initializePage])

    const handleConnectGitHub = async () => {
        try {
            const token = await getToken()
            const response = await fetch(`${API_BASE_URL}/api/github/auth-url`, {
                headers: { Authorization: `Bearer ${token}` }
            })

            if (!response.ok) throw new Error("Failed to get auth URL")

            const data = await response.json()
            if (data && data.url) {
                const width = 600
                const height = 800
                const left = window.screenX + (window.outerWidth - width) / 2
                const top = window.screenY + (window.outerHeight - height) / 2

                window.open(
                    data.url,
                    'github-install',
                    `width=${width},height=${height},left=${left},top=${top},popup=1`
                )
            } else {
                throw new Error("Invalid auth URL response")
            }

        } catch (err) {
            console.error("Failed to initiate GitHub connection:", err)
            setPageState({
                status: 'error',
                message: "Failed to initiate connection. Please try again."
            })
        }
    }

    const handleImport = (repo: GitHubRepo) => {
        router.push(`/new/configure?repo=${encodeURIComponent(repo.full_name)}&private=${repo.private}`)
    }

    // Derive values from state for rendering
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
        <div className="min-h-screen bg-zinc-50">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
                {/* Navigation */}
                <Link
                    href="/projects"
                    className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors mb-8 group"
                >
                    <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                    <span>Back to Projects</span>
                </Link>

                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">New Project</h1>
                    <p className="text-sm text-zinc-500 mt-1">Import a Git repository to deploy</p>
                </div>

                {/* Main Content - State Machine Rendering */}
                {(pageState.status === 'initializing' || pageState.status === 'checking_connection') ? (
                    // Full page spinner while initializing or checking connection
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                    </div>
                ) : pageState.status === 'error' ? (
                    // Error state - show reconnect button if GitHub token issue
                    pageState.message.toLowerCase().includes('token') ||
                        pageState.message.toLowerCase().includes('expired') ||
                        pageState.message.toLowerCase().includes('invalid') ||
                        pageState.message.toLowerCase().includes('reconnect') ? (
                        // GitHub connection issue - show Connect button
                        <div className="bg-white rounded-2xl border border-zinc-200 p-12 text-center hover:shadow-lg hover:shadow-zinc-900/5 transition-shadow">
                            <div className="w-16 h-16 rounded-2xl bg-zinc-900 flex items-center justify-center mx-auto mb-6">
                                <Github className="h-8 w-8 text-white" />
                            </div>
                            <h2 className="text-xl font-semibold text-zinc-900 mb-2">
                                Reconnect GitHub
                            </h2>
                            <p className="text-sm text-zinc-500 mb-8 max-w-sm mx-auto">
                                Your GitHub connection has expired. Please reconnect to continue.
                            </p>
                            <Button
                                onClick={handleConnectGitHub}
                                className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-full h-12 px-8 shadow-lg shadow-zinc-900/10"
                            >
                                <Github className="h-5 w-5 mr-2" />
                                Reconnect GitHub
                            </Button>
                        </div>
                    ) : (
                        // Generic error - show retry button
                        <div className="bg-white rounded-2xl border border-zinc-200 p-12 text-center">
                            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                                <AlertCircle className="h-6 w-6 text-red-500" />
                            </div>
                            <h2 className="text-lg font-semibold text-zinc-900 mb-2">Something went wrong</h2>
                            <p className="text-sm text-zinc-500 mb-6 max-w-sm mx-auto">{pageState.message}</p>
                            <Button
                                onClick={() => initializePage()}
                                variant="outline"
                                className="rounded-full"
                            >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Try Again
                            </Button>
                        </div>
                    )
                ) : pageState.status === 'not_connected' ? (
                    // Connect GitHub CTA
                    <div className="bg-white rounded-2xl border border-zinc-200 p-12 text-center hover:shadow-lg hover:shadow-zinc-900/5 transition-shadow">
                        <div className="w-16 h-16 rounded-2xl bg-zinc-900 flex items-center justify-center mx-auto mb-6">
                            <Github className="h-8 w-8 text-white" />
                        </div>
                        <h2 className="text-xl font-semibold text-zinc-900 mb-2">
                            Connect GitHub
                        </h2>
                        <p className="text-sm text-zinc-500 mb-8 max-w-sm mx-auto">
                            Link your GitHub account to import repositories and deploy your projects.
                        </p>
                        <Button
                            onClick={handleConnectGitHub}
                            className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-full h-12 px-8 shadow-lg shadow-zinc-900/10"
                        >
                            <Github className="h-5 w-5 mr-2" />
                            Connect GitHub
                        </Button>
                    </div>
                ) : (
                    // Connected states: loading_repos OR ready
                    <div className="space-y-6">
                        {/* GitHub Account Card */}
                        <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden hover:shadow-lg hover:shadow-zinc-900/5 transition-shadow">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-zinc-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center">
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

                            {/* Search */}
                            <div className="px-4 sm:px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                                    <Input
                                        placeholder="Search repositories..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-11 h-11 bg-white border-zinc-200 rounded-xl text-sm focus-visible:ring-zinc-200"
                                    />
                                </div>
                            </div>

                            {/* Loading state - show skeleton when loading repos */}
                            {pageState.status === 'loading_repos' ? (
                                <div className="divide-y divide-zinc-100">
                                    {[1, 2, 3, 4, 5].map(i => (
                                        <div key={i} className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-zinc-100 animate-pulse" />
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
                                            {/* Icon with language color */}
                                            <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0 relative self-start sm:self-center">
                                                <GitBranch className="h-5 w-5 text-zinc-500" />
                                                {repo.language && LANGUAGE_COLORS[repo.language] && (
                                                    <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${LANGUAGE_COLORS[repo.language]} border-2 border-white`} />
                                                )}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-zinc-900 truncate">
                                                        {repo.name}
                                                    </span>
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
                                                            <span className="text-zinc-300">·</span>
                                                        </>
                                                    )}
                                                    <span>Updated {formatRelativeTime(repo.updated_at)}</span>
                                                </div>
                                            </div>

                                            {/* Import Button */}
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

                        {/* Help Text */}
                        <p className="text-center text-xs text-zinc-400">
                            Don&apos;t see your repository?{" "}
                            <a
                                href="https://github.com/apps/shorlabs/installations/new"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-zinc-600 hover:text-zinc-900 underline underline-offset-2"
                            >
                                Adjust GitHub permissions
                            </a>
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
