"use client"

import { useState, useEffect, Suspense, useCallback } from "react"
import { useAuth, useClerk } from "@clerk/nextjs"
import { useRouter, useSearchParams } from "next/navigation"
import {
    Github,
    ArrowLeft,
    ChevronDown,
    ChevronRight,
    Loader2,
    AlertCircle,
    Rocket,
    GitBranch,
    Folder,
    FolderOpen,
    FileText,
    Settings2,
    Globe,
    Code2,
    Cpu,
    Clock,
    Check,
    Sparkles,
    HardDrive,
    Lock
} from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { UpgradeModal, useUpgradeModal } from "@/components/upgrade-modal"
import { EnvironmentVariablesEditor, EnvironmentVariablesSecurityNote, type EnvVar } from "@/components/EnvironmentVariablesEditor"
import { StartCommandInput } from "@/components/StartCommandInput"
import { ComputeSettings } from "@/components/ComputeSettings"
import { useIsPro } from "@/hooks/use-is-pro"
import { trackEvent } from "@/lib/amplitude"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

// Project limits by plan:
// - Hobby: 1 project
// - Pro: unlimited projects
const FREE_PROJECT_LIMIT = Infinity
const PRO_PROJECT_LIMIT = Infinity

interface DirectoryItem {
    name: string
    path: string
    type: "file" | "dir"
}

interface DirectoryState {
    [path: string]: {
        items: DirectoryItem[]
        loading: boolean
        expanded: boolean
    }
}

function ConfigureProjectContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { getToken, orgId } = useAuth()
    const { signOut } = useClerk()
    const { isPro, currentPlan } = useIsPro()
    const { isOpen: upgradeOpen, openUpgradeModal, closeUpgradeModal } = useUpgradeModal()

    const repoFullName = searchParams.get("repo") || ""
    const isPrivateRepo = searchParams.get("private") === "true"
    const [, repoName] = repoFullName.split("/")

    const [projectName, setProjectName] = useState(repoName || "")
    const [rootDirectory, setRootDirectory] = useState("./")
    const [showDirPicker, setShowDirPicker] = useState(false)
    const [selectedDir, setSelectedDir] = useState("./")
    const [directories, setDirectories] = useState<DirectoryState>({})
    const [loadingRootDir, setLoadingRootDir] = useState(false)
    const [envVars, setEnvVars] = useState<EnvVar[]>([])
    const [startCommand, setStartCommand] = useState("uvicorn main:app --host 0.0.0.0 --port 8080")
    const [deploying, setDeploying] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [activeSection, setActiveSection] = useState<"general" | "compute" | "environment">("general")

    // Framework detection state
    const [detectedFramework, setDetectedFramework] = useState<string | null>(null)
    const [detectingFramework, setDetectingFramework] = useState(true)
    const [detectionConfidence, setDetectionConfidence] = useState<"high" | "medium" | "low">("low")

    // Compute settings (defaults: 1 GB memory, 1 GB temp storage, 30s timeout)
    const [memory, setMemory] = useState(1024)
    const [timeout, setTimeout] = useState(30)
    const [ephemeralStorage, setEphemeralStorage] = useState(1024)

    // Project limit check
    const [projectCount, setProjectCount] = useState(0)
    const projectLimit = isPro ? PRO_PROJECT_LIMIT : FREE_PROJECT_LIMIT
    const isAtLimit = projectCount >= projectLimit

    // Fetch project count on mount
    useEffect(() => {
        if (!orgId) return

        const fetchProjects = async () => {
            try {
                const token = await getToken()
                if (!token) return

                const url = new URL(`${API_BASE_URL}/api/projects`)
                url.searchParams.append("org_id", orgId)

                const response = await fetch(url.toString(), {
                    headers: { Authorization: `Bearer ${token}` },
                })

                if (response.ok) {
                    const data = await response.json()
                    setProjectCount(data.length)
                }
            } catch (err) {
                console.error("Failed to fetch projects:", err)
            }
        }
        fetchProjects()
    }, [getToken, orgId])

    // Redirect if no repo selected
    useEffect(() => {
        if (!repoFullName) {
            router.push("/new")
        }
    }, [repoFullName, router])

    const fetchDirectoryContents = useCallback(async (path: string = "") => {
        // Force a fresh token by skipping the cache
        const token = await getToken({ skipCache: true })
        if (!token) {
            signOut({ redirectUrl: "/sign-in" })
            return []
        }

        try {
            const url = new URL(`${API_BASE_URL}/api/github/repos/${encodeURIComponent(repoFullName)}/contents`)
            if (orgId) url.searchParams.append("org_id", orgId)
            if (path) url.searchParams.append("path", path)

            const response = await fetch(
                url.toString(),
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            )

            if (!response.ok) {
                const data = await response.json().catch(() => ({ detail: "Unknown error" }))

                // Handle token expiration by signing out
                if (response.status === 401 && data.detail === "Token expired") {
                    console.warn("Token expired, signing out...")
                    signOut({ redirectUrl: "/sign-in" })
                    return []
                }

                throw new Error("Failed to fetch directory contents")
            }

            const data = await response.json()
            // Filter to only directories
            return data.filter((item: DirectoryItem) => item.type === "dir")
        } catch (err) {
            console.error("Failed to fetch directory:", err)
            return []
        }
    }, [getToken, signOut, repoFullName])

    const openDirectoryPicker = async () => {
        setShowDirPicker(true)
        setSelectedDir(rootDirectory)

        // Fetch root directory contents
        if (!directories["root"]) {
            setLoadingRootDir(true)
            const items = await fetchDirectoryContents("")
            setDirectories(prev => ({
                ...prev,
                root: { items, loading: false, expanded: true }
            }))
            setLoadingRootDir(false)
        }
    }

    const toggleDirectory = async (path: string) => {
        const dir = directories[path]

        if (dir) {
            // Toggle expansion
            setDirectories(prev => ({
                ...prev,
                [path]: { ...prev[path], expanded: !prev[path].expanded }
            }))
        } else {
            // Fetch and expand
            setDirectories(prev => ({
                ...prev,
                [path]: { items: [], loading: true, expanded: true }
            }))

            const items = await fetchDirectoryContents(path)
            setDirectories(prev => ({
                ...prev,
                [path]: { items, loading: false, expanded: true }
            }))
        }
    }

    const confirmDirectorySelection = () => {
        setRootDirectory(selectedDir)
        setShowDirPicker(false)
    }

    // Framework detection function
    const detectFramework = useCallback(async (rootDir: string) => {
        if (!repoFullName) return

        setDetectingFramework(true)
        setDetectedFramework(null)

        try {
            const token = await getToken()
            if (!token) return

            const url = new URL(`${API_BASE_URL}/api/github/repos/${repoFullName}/detect-framework`)
            if (orgId) url.searchParams.append("org_id", orgId)
            url.searchParams.append("root_directory", rootDir)

            const response = await fetch(
                url.toString(),
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            )

            if (response.ok) {
                const data = await response.json()
                if (data.detected && data.suggested_command) {
                    setStartCommand(data.suggested_command)
                    setDetectedFramework(data.framework)
                    setDetectionConfidence(data.confidence)
                } else if (data.detected && data.runtime === "nodejs") {
                    // Node.js detected but no specific command
                    setStartCommand("npm run start")
                    setDetectedFramework(data.framework || "Node.js")
                    setDetectionConfidence("medium")
                } else {
                    // No detection - set a sensible default
                    setStartCommand("uvicorn main:app --host 0.0.0.0 --port 8080")
                    setDetectedFramework(null)
                    setDetectionConfidence("low")
                }
            }
        } catch (err) {
            console.error("Framework detection failed:", err)
            // Fallback to default
            setStartCommand("uvicorn main:app --host 0.0.0.0 --port 8080")
        } finally {
            setDetectingFramework(false)
        }
    }, [repoFullName, getToken])

    // Detect framework on mount and when root directory changes
    useEffect(() => {
        if (repoFullName) {
            detectFramework(rootDirectory)
        }
    }, [repoFullName, rootDirectory, detectFramework])

    const handleDeploy = async () => {
        if (!projectName.trim() || !repoFullName) return

        setDeploying(true)
        setError(null)
        try {
            const token = await getToken()
            const response = await fetch(`${API_BASE_URL}/api/projects`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    organization_id: orgId || "",
                    name: projectName.trim(),
                    github_repo: repoFullName,
                    root_directory: rootDirectory,
                    env_vars: envVars.reduce((acc, { key, value }) => {
                        if (key.trim()) acc[key.trim()] = value
                        return acc
                    }, {} as Record<string, string>),
                    start_command: startCommand.trim(),
                    memory,
                    timeout,
                    ephemeral_storage: ephemeralStorage,
                }),
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.detail || "Failed to create project")
            }

            const data = await response.json()

            // Track successful project creation
            trackEvent('Project Created', {
                project_id: data.project_id,
                project_name: projectName.trim(),
                github_repo: repoFullName,
                memory_mb: memory,
                timeout_seconds: timeout,
                ephemeral_storage_mb: ephemeralStorage,
                env_var_count: envVars.filter(v => v.key.trim()).length,
                user_tier: isPro ? 'pro' : 'hobby'
            })

            router.push(`/projects/${data.project_id}`)
        } catch (err) {
            console.error("Failed to create project:", err)
            setError(err instanceof Error ? err.message : "Failed to create project")

            // Track error
            trackEvent('Error Occurred', {
                error_type: 'project_creation_failed',
                error_message: err instanceof Error ? err.message : 'Unknown error',
                context: 'project_deployment'
            })
        } finally {
            setDeploying(false)
        }
    }

    // Recursive directory tree item
    const DirectoryTreeItem = ({ item, depth = 0 }: { item: DirectoryItem; depth?: number }) => {
        const dir = directories[item.path]
        const isExpanded = dir?.expanded
        const isLoading = dir?.loading
        const isSelected = selectedDir === item.path || selectedDir === `./${item.path}`
        const hasChildren = dir?.items && dir.items.length > 0

        return (
            <div>
                <div
                    className={`flex items-center gap-2 py-2.5 px-3 cursor-pointer transition-colors rounded-lg mx-2 ${isSelected ? "bg-zinc-100" : "hover:bg-zinc-50"
                        }`}
                    style={{ paddingLeft: `${12 + depth * 20}px` }}
                >
                    {/* Expand/Collapse button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            toggleDirectory(item.path)
                        }}
                        className="p-0.5 hover:bg-zinc-200 rounded transition-colors"
                    >
                        {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                        ) : isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-zinc-400" />
                        ) : (
                            <ChevronRight className="h-4 w-4 text-zinc-400" />
                        )}
                    </button>

                    {/* Radio button */}
                    <button
                        onClick={() => setSelectedDir(`./${item.path}`)}
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected
                            ? "border-zinc-900 bg-zinc-900"
                            : "border-zinc-300 hover:border-zinc-400"
                            }`}
                    >
                        {isSelected && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                    </button>

                    {/* Folder icon */}
                    {isExpanded ? (
                        <FolderOpen className="h-4 w-4 text-zinc-500 shrink-0" />
                    ) : (
                        <Folder className="h-4 w-4 text-zinc-500 shrink-0" />
                    )}

                    {/* Name */}
                    <span className="text-sm text-zinc-900 font-medium truncate">
                        {item.name}
                    </span>
                </div>

                {/* Children */}
                {isExpanded && hasChildren && (
                    <div>
                        {dir.items.map((child) => (
                            <DirectoryTreeItem
                                key={child.path}
                                item={child}
                                depth={depth + 1}
                            />
                        ))}
                    </div>
                )}
            </div>
        )
    }

    if (!repoFullName) {
        return null
    }

    const sections = [
        { id: "general" as const, label: "General", icon: Settings2 },
        { id: "compute" as const, label: "Compute", icon: Cpu },
        { id: "environment" as const, label: "Environment", icon: Code2 },
    ]



    return (
        <div className="min-h-screen bg-zinc-50">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
                {/* Navigation */}
                <Link
                    href="/new"
                    className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors mb-8 group"
                >
                    <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                    <span>Back to Repositories</span>
                </Link>

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 sm:mb-8">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">Configure Project</h1>
                        <p className="text-sm text-zinc-500 mt-1">Review your settings before deploying</p>
                    </div>
                    {isAtLimit ? (
                        <Button
                            onClick={openUpgradeModal}
                            className="bg-blue-900 hover:bg-blue-800 text-white rounded-full h-11 px-6 shadow-lg shadow-blue-900/10 w-full sm:w-auto"
                        >
                            <Sparkles className="h-4 w-4 mr-2" />
                            Upgrade to Deploy
                        </Button>
                    ) : (
                        <Button
                            onClick={handleDeploy}
                            disabled={!projectName.trim() || !startCommand.trim() || deploying || detectingFramework}
                            className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-full h-11 px-6 shadow-lg shadow-zinc-900/10 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none w-full sm:w-auto"
                        >
                            {deploying ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Deploying...
                                </>
                            ) : detectingFramework ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Detecting...
                                </>
                            ) : (
                                <>
                                    <Rocket className="h-4 w-4 mr-2" />
                                    Deploy
                                </>
                            )}
                        </Button>
                    )}
                </div>

                {/* Source Card - Compact inline layout */}
                <div className="bg-white rounded-2xl border border-zinc-200 px-4 py-3 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center shrink-0">
                            <Github className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-semibold text-zinc-900 truncate">{repoFullName}</div>
                            <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
                                <GitBranch className="h-3 w-3" />
                                <span>main</span>
                                <span className="text-zinc-300">•</span>
                                {isPrivateRepo ? (
                                    <>
                                        <Lock className="h-3 w-3" />
                                        <span>Private</span>
                                    </>
                                ) : (
                                    <>
                                        <Globe className="h-3 w-3" />
                                        <span>Public</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Error State */}
                {error && (
                    <div className="flex items-start gap-3 text-sm text-red-600 bg-red-50 p-4 rounded-2xl border border-red-100 mb-6">
                        <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium">Deployment failed</p>
                            <p className="text-red-500 mt-0.5">{error}</p>
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex items-center gap-1 mb-6 border-b border-zinc-200 overflow-x-auto">
                    {sections.map((section) => (
                        <button
                            key={section.id}
                            onClick={() => setActiveSection(section.id)}
                            className={`flex items-center gap-2 px-3 sm:px-4 py-3 text-sm font-medium transition-colors relative whitespace-nowrap ${activeSection === section.id
                                ? "text-zinc-900"
                                : "text-zinc-500 hover:text-zinc-700"
                                }`}
                        >
                            
                            {section.label}
                            {activeSection === section.id && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />
                            )}
                        </button>
                    ))}
                </div>

                {/* General Section */}
                {activeSection === "general" && (
                    <div className="space-y-6">
                        {/* Project Name + Root Directory - Side by side */}
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                            {/* Project Name - Takes 3 columns */}
                            <div className="lg:col-span-3 bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                                <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-zinc-100">
                                    <FileText className="h-5 w-5 text-zinc-400" />
                                    <h3 className="font-semibold text-zinc-900">Project Name</h3>
                                </div>
                                <div className="p-4 sm:p-6">
                                    <Input
                                        value={projectName}
                                        onChange={(e) => setProjectName(e.target.value)}
                                        placeholder="my-awesome-project"
                                        className="h-12 text-sm border-zinc-200 rounded-xl font-medium"
                                    />
                                    <p className="text-xs text-zinc-500 mt-2">
                                        Used in your deployment URL
                                    </p>
                                </div>
                            </div>

                            {/* Root Directory - Takes 2 columns */}
                            <div className="lg:col-span-2 bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                                <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-zinc-100">
                                    <Folder className="h-5 w-5 text-zinc-400" />
                                    <h3 className="font-semibold text-zinc-900">Root Directory</h3>
                                </div>
                                <div className="p-4 sm:p-6">
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 flex items-center gap-3 bg-zinc-50 rounded-xl px-4 py-3.5 border border-zinc-100 min-w-0">
                                            <Folder className="h-4 w-4 text-zinc-400 shrink-0" />
                                            <span className="font-mono text-sm text-zinc-700 truncate">{rootDirectory}</span>
                                        </div>
                                        <Button
                                            variant="outline"
                                            onClick={openDirectoryPicker}
                                            className="h-12 rounded-xl shrink-0 px-4"
                                        >
                                            Edit
                                        </Button>
                                    </div>
                                    <p className="text-xs text-zinc-500 mt-2">
                                        For monorepo projects
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Start Command - Full width */}
                        <StartCommandInput
                            value={startCommand}
                            onChange={setStartCommand}
                            detectedFramework={detectedFramework}
                            isDetecting={detectingFramework}
                            detectionConfidence={detectionConfidence}
                        />
                    </div>
                )}

                {/* Compute Section */}
                {activeSection === "compute" && (
                    <ComputeSettings
                        memory={memory}
                        timeout={timeout}
                        ephemeralStorage={ephemeralStorage}
                        onMemoryChange={setMemory}
                        onTimeoutChange={setTimeout}
                        onEphemeralStorageChange={setEphemeralStorage}
                        plan={currentPlan ?? "hobby"}
                        onUpgradeClick={openUpgradeModal}
                    />
                )}

                {/* Environment Section */}
                {activeSection === "environment" && (
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                        {/* Environment Variables - Takes 3 columns */}
                        <div className="lg:col-span-3">
                            <EnvironmentVariablesEditor
                                envVars={envVars}
                                onChange={setEnvVars}
                                showImport={true}
                            />
                        </div>

                        {/* Security Note - Takes 2 columns */}
                        <div className="lg:col-span-2">
                            <EnvironmentVariablesSecurityNote />
                        </div>
                    </div>
                )}
            </div>

            {/* Root Directory Picker Dialog */}
            <Dialog open={showDirPicker} onOpenChange={setShowDirPicker}>
                <DialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden rounded-2xl">
                    <DialogHeader className="px-6 pt-6 pb-4 text-center">
                        <DialogTitle className="text-xl font-semibold text-zinc-900">
                            Root Directory
                        </DialogTitle>
                        <p className="text-sm text-zinc-500 mt-2">
                            Select the directory where your source code is located. To deploy a monorepo, create separate projects for other directories in the future.
                        </p>
                        <div className="flex items-center justify-center gap-2 mt-4">
                            <Github className="h-4 w-4 text-zinc-600" />
                            <span className="text-sm font-medium text-zinc-900">{repoFullName}</span>
                        </div>
                    </DialogHeader>

                    {/* Directory Tree */}
                    <div className="border-t border-zinc-100 max-h-[320px] overflow-y-auto py-2">
                        {/* Root option */}
                        <div
                            className={`flex items-center gap-2 py-2.5 px-3 cursor-pointer transition-colors rounded-lg mx-2 ${selectedDir === "./" ? "bg-zinc-100" : "hover:bg-zinc-50"
                                }`}
                            onClick={() => setSelectedDir("./")}
                        >
                            <div className="w-5" /> {/* Spacer for alignment */}
                            <button
                                onClick={() => setSelectedDir("./")}
                                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${selectedDir === "./"
                                    ? "border-zinc-900 bg-zinc-900"
                                    : "border-zinc-300 hover:border-zinc-400"
                                    }`}
                            >
                                {selectedDir === "./" && (
                                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                )}
                            </button>
                            <Folder className="h-4 w-4 text-zinc-500 shrink-0" />
                            <span className="text-sm text-zinc-900 font-medium">
                                {repoFullName.split("/")[1]} <span className="text-zinc-400 font-normal">(root)</span>
                            </span>
                        </div>

                        {/* Loading state */}
                        {loadingRootDir ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                            </div>
                        ) : (
                            /* Directory tree */
                            directories["root"]?.items.map((item) => (
                                <DirectoryTreeItem key={item.path} item={item} />
                            ))
                        )}

                        {/* Empty state */}
                        {!loadingRootDir && directories["root"]?.items.length === 0 && (
                            <div className="text-center py-8 text-sm text-zinc-500">
                                No subdirectories found
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between">
                        <Button
                            variant="outline"
                            onClick={() => setShowDirPicker(false)}
                            className="rounded-full"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={confirmDirectorySelection}
                            className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-full px-6"
                        >
                            Continue
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Upgrade Modal */}
            <UpgradeModal isOpen={upgradeOpen} onClose={closeUpgradeModal} />
        </div>
    )
}

export default function ConfigureProjectPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
        }>
            <ConfigureProjectContent />
        </Suspense>
    )
}
