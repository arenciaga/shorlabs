"use client"

import { useState, useEffect, useCallback, use, useRef } from "react"
import { useAuth, useClerk } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import {
    ArrowLeft,
    ExternalLink,
    Github,
    Loader2,
    RotateCw,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Trash2,
    Plus,
    Save,
    X,
    Copy,
    Check,
    Clock,
    Terminal,
    Settings2,
    Activity,
    Globe,
    GitBranch,
    Zap,
    Eye,
    EyeOff,
    RefreshCw,
    Cpu,
    HardDrive
} from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { UpgradeModal, useUpgradeModal } from "@/components/upgrade-modal"
import { ComputeSettings } from "@/components/ComputeSettings"
import { StartCommandInput } from "@/components/StartCommandInput"
import { DeploymentLogs } from "@/components/DeploymentLogs"
import { EnvironmentVariablesEditor } from "@/components/EnvironmentVariablesEditor"
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
    ecr_repo: string | null
    env_vars: Record<string, string>
    start_command: string
    root_directory: string
    memory: number
    timeout: number
    ephemeral_storage: number
    created_at: string
    updated_at: string
}

interface Deployment {
    deploy_id: string
    build_id: string
    status: "IN_PROGRESS" | "SUCCEEDED" | "FAILED"
    started_at: string
    finished_at: string | null
}

interface ProjectDetails {
    project: Project
    deployments: Deployment[]
}

const STATUS_CONFIG: Record<string, { dot: string; label: string; color: string; bgGlow: string }> = {
    PENDING: { dot: "bg-zinc-400", label: "Queued", color: "text-zinc-600", bgGlow: "" },
    CLONING: { dot: "bg-blue-500", label: "Cloning", color: "text-blue-600", bgGlow: "shadow-blue-500/20" },
    PREPARING: { dot: "bg-blue-500", label: "Preparing", color: "text-blue-600", bgGlow: "shadow-blue-500/20" },
    UPLOADING: { dot: "bg-blue-600", label: "Uploading", color: "text-blue-600", bgGlow: "shadow-blue-500/20" },
    BUILDING: { dot: "bg-blue-900", label: "Building", color: "text-blue-900", bgGlow: "shadow-blue-900/20" },
    DEPLOYING: { dot: "bg-blue-900", label: "Deploying", color: "text-blue-900", bgGlow: "shadow-blue-900/20" },
    LIVE: { dot: "bg-emerald-500", label: "Live", color: "text-emerald-600", bgGlow: "shadow-emerald-500/30" },
    FAILED: { dot: "bg-red-500", label: "Failed", color: "text-red-600", bgGlow: "shadow-red-500/20" },
}

const BUILD_STEPS = ["CLONING", "PREPARING", "UPLOADING", "BUILDING", "DEPLOYING"]

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const { getToken, isLoaded, orgId } = useAuth()
    const { signOut } = useClerk()
    const [data, setData] = useState<ProjectDetails | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [confirmProjectName, setConfirmProjectName] = useState("")
    const [confirmPhrase, setConfirmPhrase] = useState("")
    const [copied, setCopied] = useState(false)
    const [redeploying, setRedeploying] = useState(false)
    const [activeTab, setActiveTab] = useState<"deployments" | "logs" | "compute" | "settings">("deployments")

    // Pro tier check via Autumn
    const { isPro } = useIsPro()
    const { isOpen: upgradeModalOpen, openUpgradeModal, closeUpgradeModal } = useUpgradeModal()

    // Env vars editing state
    const [editingEnvVars, setEditingEnvVars] = useState(false)
    const [envVarsList, setEnvVarsList] = useState<{ key: string; value: string; visible: boolean }[]>([])
    const [savingEnvVars, setSavingEnvVars] = useState(false)

    // Start command editing state
    const [editingStartCommand, setEditingStartCommand] = useState(false)
    const [startCommandValue, setStartCommandValue] = useState("")
    const [savingStartCommand, setSavingStartCommand] = useState(false)

    // Compute settings editing state
    const [editingCompute, setEditingCompute] = useState(false)
    const [memoryValue, setMemoryValue] = useState(1024)
    const [timeoutValue, setTimeoutValue] = useState(30)
    const [ephemeralStorageValue, setEphemeralStorageValue] = useState(512)
    const [savingCompute, setSavingCompute] = useState(false)

    // Logs state
    const [logs, setLogs] = useState<{ timestamp: string; message: string; level: string }[]>([])
    const [logsLoading, setLogsLoading] = useState(false)
    const logsContainerRef = useRef<HTMLDivElement>(null)

    // Deployment logs expansion state
    const [expandedDeployId, setExpandedDeployId] = useState<string | null>(null)

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleDeleteProject = async () => {
        setDeleting(true)
        try {
            const token = await getToken()

            // Track before deletion
            if (data?.project) {
                const projectAge = data.project.created_at
                    ? Math.floor((Date.now() - new Date(data.project.created_at).getTime()) / (1000 * 60 * 60 * 24))
                    : 0

                trackEvent('Project Deleted', {
                    project_id: id,
                    project_name: data.project.name,
                    project_age_days: projectAge,
                    deployment_count: data.deployments?.length || 0
                })
            }

            const url = new URL(`${API_BASE_URL}/api/projects/${id}`)
            if (orgId) url.searchParams.append("org_id", orgId)

            const response = await fetch(url.toString(), {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.detail || "Failed to delete project")
            }

            router.push("/projects")
        } catch (err) {
            console.error("Failed to delete project:", err)
            setError(err instanceof Error ? err.message : "Failed to delete project")

            trackEvent('Error Occurred', {
                error_type: 'project_deletion_failed',
                error_message: err instanceof Error ? err.message : 'Unknown error',
                context: 'project_deletion',
                project_id: id
            })

            setDeleting(false)
            setDeleteDialogOpen(false)
        }
    }

    const handleRedeploy = async () => {
        setRedeploying(true)
        try {
            const token = await getToken()
            const url = new URL(`${API_BASE_URL}/api/projects/${id}/redeploy`)
            if (orgId) url.searchParams.append("org_id", orgId)

            await fetch(url.toString(), {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            })
            fetchProject()
        } catch (err) {
            console.error("Redeploy failed:", err)
        } finally {
            setRedeploying(false)
        }
    }

    const startEditingEnvVars = () => {
        if (!data?.project) return
        const vars = Object.entries(data.project.env_vars || {}).map(([key, value]) => ({ key, value, visible: false }))
        setEnvVarsList(vars.length > 0 ? vars : [{ key: "", value: "", visible: true }])
        setEditingEnvVars(true)
    }

    const saveEnvVars = async () => {
        setSavingEnvVars(true)
        try {
            const token = await getToken()
            const envVarsObj = envVarsList.reduce((acc, { key, value }) => {
                if (key.trim()) acc[key.trim()] = value
                return acc
            }, {} as Record<string, string>)

            const url = new URL(`${API_BASE_URL}/api/projects/${id}/env-vars`)
            if (orgId) url.searchParams.append("org_id", orgId)

            const response = await fetch(url.toString(), {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ env_vars: envVarsObj }),
            })

            if (!response.ok) {
                throw new Error("Failed to save environment variables")
            }

            setEditingEnvVars(false)
            fetchProject()
        } catch (err) {
            console.error("Failed to save env vars:", err)
        } finally {
            setSavingEnvVars(false)
        }
    }

    const startEditingStartCommand = () => {
        if (!data?.project) return
        setStartCommandValue(data.project.start_command || "")
        setEditingStartCommand(true)
    }

    const saveStartCommand = async () => {
        setSavingStartCommand(true)
        try {
            const token = await getToken()
            const url = new URL(`${API_BASE_URL}/api/projects/${id}`)
            if (orgId) url.searchParams.append("org_id", orgId)

            const response = await fetch(url.toString(), {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ start_command: startCommandValue }),
            })

            if (!response.ok) {
                throw new Error("Failed to save start command")
            }

            setEditingStartCommand(false)
            fetchProject()
        } catch (err) {
            console.error("Failed to save start command:", err)
        } finally {
            setSavingStartCommand(false)
        }
    }

    const startEditingCompute = (overrides?: { memory?: number, timeout?: number, ephemeral_storage?: number }) => {
        if (!data?.project) return
        setMemoryValue(overrides?.memory ?? data.project.memory ?? 1024)
        setTimeoutValue(overrides?.timeout ?? data.project.timeout ?? 30)
        setEphemeralStorageValue(overrides?.ephemeral_storage ?? data.project.ephemeral_storage ?? 512)
        setEditingCompute(true)
    }

    const saveCompute = async () => {
        setSavingCompute(true)
        try {
            const token = await getToken()
            const url = new URL(`${API_BASE_URL}/api/projects/${id}`)
            if (orgId) url.searchParams.append("org_id", orgId)

            const response = await fetch(url.toString(), {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    memory: memoryValue,
                    timeout: timeoutValue,
                    ephemeral_storage: ephemeralStorageValue,
                }),
            })

            if (!response.ok) {
                throw new Error("Failed to save compute settings")
            }

            setEditingCompute(false)
            fetchProject()
        } catch (err) {
            console.error("Failed to save compute settings:", err)
        } finally {
            setSavingCompute(false)
        }
    }

    const fetchLogs = useCallback(async () => {
        setLogsLoading(true)
        try {
            const token = await getToken()
            const url = new URL(`${API_BASE_URL}/api/projects/${id}/runtime`)
            if (orgId) url.searchParams.append("org_id", orgId)

            const response = await fetch(
                url.toString(),
                { headers: { Authorization: `Bearer ${token}` } }
            )
            if (response.ok) {
                const data = await response.json()
                setLogs(data.logs || [])
            }
        } catch (err) {
            console.error("Error fetching logs:", err)
        } finally {
            setLogsLoading(false)
        }
    }, [getToken, id, orgId])

    // Fetch logs when logs tab is selected
    useEffect(() => {
        if (activeTab === "logs") {
            fetchLogs()
        }
    }, [activeTab, fetchLogs])

    const fetchProject = useCallback(async () => {
        try {
            const token = await getToken({ skipCache: true })
            if (!token) {
                signOut({ redirectUrl: "/sign-in" })
                return
            }

            const url = new URL(`${API_BASE_URL}/api/projects/${id}`)
            if (orgId) url.searchParams.append("org_id", orgId)

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
                throw new Error(data.detail || "Failed to fetch project")
            }

            const result = await response.json()
            setData(result)
            setError(null)
        } catch (err) {
            console.error("Failed to fetch project:", err)
            setError(err instanceof Error ? err.message : "Failed to fetch project")
        } finally {
            setLoading(false)
        }
    }, [getToken, signOut, id, orgId])

    useEffect(() => {
        if (isLoaded && orgId) {
            fetchProject()
        }
    }, [isLoaded, orgId, fetchProject])

    useEffect(() => {
        if (!data) return
        const isInProgress = !["LIVE", "FAILED"].includes(data.project.status)
        if (!isInProgress) return

        const interval = setInterval(fetchProject, 3000)
        return () => clearInterval(interval)
    }, [data, fetchProject])

    // Auto-expand the latest IN_PROGRESS deployment to show logs
    useEffect(() => {
        if (!data?.deployments) return
        const inProgressDeployment = data.deployments.find(d => d.status === "IN_PROGRESS")
        if (inProgressDeployment && !expandedDeployId) {
            setExpandedDeployId(inProgressDeployment.deploy_id)
        }
    }, [data?.deployments, expandedDeployId])

    // Loading skeleton
    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-50">
                <div className="max-w-6xl mx-auto px-8 py-10">
                    <div className="animate-pulse">
                        <div className="h-4 w-20 bg-zinc-200 rounded mb-8" />
                        <div className="h-10 w-64 bg-zinc-200 rounded-lg mb-2" />
                        <div className="h-5 w-48 bg-zinc-100 rounded mb-8" />
                        <div className="grid grid-cols-3 gap-4 mb-8">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-24 bg-white rounded-2xl border border-zinc-200" />
                            ))}
                        </div>
                        <div className="h-64 bg-white rounded-2xl border border-zinc-200" />
                    </div>
                </div>
            </div>
        )
    }

    if (error || !data) {
        return (
            <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="h-8 w-8 text-red-500" />
                    </div>
                    <h2 className="text-xl font-semibold text-zinc-900 mb-2">Something went wrong</h2>
                    <p className="text-zinc-500 mb-6">{error || "Project not found"}</p>
                    <Button onClick={fetchProject} variant="outline" className="rounded-full">
                        Try Again
                    </Button>
                </div>
            </div>
        )
    }

    const { project, deployments } = data
    const statusConfig = STATUS_CONFIG[project.status] || STATUS_CONFIG.PENDING
    const isBuilding = !["LIVE", "FAILED"].includes(project.status)
    const currentStepIndex = BUILD_STEPS.indexOf(project.status)
    const latestDeployment = deployments[0]

    return (
        <>
            <div className="min-h-screen bg-zinc-50">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
                    {/* Navigation */}
                    <Link
                        href="/projects"
                        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors mb-8 group"
                    >
                        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                        <span>Projects</span>
                    </Link>

                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 sm:mb-8">
                        <div>
                            <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-2">
                                <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 tracking-tight">{project.name}</h1>
                                <div className={`flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-zinc-200 shadow-sm ${statusConfig.bgGlow}`}>
                                    <span className={`w-2 h-2 rounded-full ${statusConfig.dot} ${isBuilding ? 'animate-pulse' : ''}`} />
                                    <span className={`text-sm font-medium ${statusConfig.color}`}>{statusConfig.label}</span>
                                </div>
                            </div>
                            <a
                                href={project.github_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors"
                            >
                                <Github className="h-4 w-4" />
                                <span className="font-mono text-sm">{project.github_repo}</span>
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                onClick={handleRedeploy}
                                disabled={isBuilding || redeploying}
                                className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-full h-10 px-5 shadow-lg shadow-zinc-900/10"
                            >
                                <RotateCw className={`h-4 w-4 mr-2 ${redeploying ? 'animate-spin' : ''}`} />
                                Redeploy
                            </Button>
                        </div>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 sm:mb-8">
                        {/* Production URL */}
                        <div className="md:col-span-2 bg-white rounded-2xl border border-zinc-200 p-4 sm:p-5 ">
                            <div className="flex items-center gap-2 text-zinc-500 mb-3">
                                <Globe className="h-4 w-4" />
                                <span className="text-xs font-medium uppercase tracking-wider">Production</span>
                            </div>
                            {(project.custom_url || project.function_url) ? (
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 bg-zinc-50 rounded-xl px-4 py-3 font-mono text-sm text-zinc-700 border border-zinc-100 truncate">
                                        {(project.custom_url || project.function_url)!.replace("https://", "")}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => copyToClipboard((project.custom_url || project.function_url)!)}
                                        className="h-10 w-10 rounded-xl hover:bg-zinc-100 shrink-0"
                                    >
                                        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                                    </Button>
                                    <a href={(project.custom_url || project.function_url)!} target="_blank" rel="noopener noreferrer">
                                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-zinc-100 shrink-0">
                                            <ExternalLink className="h-4 w-4" />
                                        </Button>
                                    </a>
                                </div>
                            ) : (
                                <div className="text-zinc-400 text-sm">Deploying...</div>
                            )}
                        </div>

                        {/* Last Deployment */}
                        <div className="bg-white rounded-2xl border border-zinc-200 p-4 sm:p-5 ">
                            <div className="flex items-center gap-2 text-zinc-500 mb-3">
                                <Activity className="h-4 w-4" />
                                <span className="text-xs font-medium uppercase tracking-wider">Last Deploy</span>
                            </div>
                            {latestDeployment ? (
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-mono text-sm text-zinc-700">{latestDeployment.deploy_id}</p>
                                        <p className="text-xs text-zinc-400 mt-1">
                                            {new Date(latestDeployment.started_at).toLocaleDateString("en-US", {
                                                month: "short",
                                                day: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </p>
                                    </div>
                                    {latestDeployment.status === "SUCCEEDED" && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                                    {latestDeployment.status === "FAILED" && <XCircle className="h-5 w-5 text-red-500" />}
                                    {latestDeployment.status === "IN_PROGRESS" && <Loader2 className="h-5 w-5 text-blue-900 animate-spin" />}
                                </div>
                            ) : (
                                <div className="text-zinc-400 text-sm">No deployments</div>
                            )}
                        </div>
                    </div>

                    {/* Build Progress - Only show when building */}
                    {isBuilding && (
                        <div className="bg-white rounded-2xl border border-zinc-200 p-6 mb-8 overflow-hidden">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-blue-900 flex items-center justify-center">
                                        <Zap className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-zinc-900">Building your project</h3>
                                        <p className="text-sm text-zinc-500">Step {currentStepIndex + 1} of {BUILD_STEPS.length}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Progress Steps */}
                            <div className="relative">
                                <div className="absolute top-4 left-0 right-0 h-0.5 bg-zinc-100" />
                                <div
                                    className="absolute top-4 left-0 h-0.5 bg-zinc-900 transition-all duration-500"
                                    style={{ width: `${(currentStepIndex / (BUILD_STEPS.length - 1)) * 100}%` }}
                                />
                                <div className="relative flex justify-between">
                                    {BUILD_STEPS.map((step, index) => {
                                        const isComplete = index < currentStepIndex
                                        const isCurrent = step === project.status
                                        return (
                                            <div key={step} className="flex flex-col items-center">
                                                <div className={`
                                                w-8 h-8 rounded-full flex items-center justify-center z-10 transition-all
                                                ${isComplete ? "bg-zinc-900 text-white" : ""}
                                                ${isCurrent ? "bg-zinc-900 text-white ring-4 ring-zinc-100" : ""}
                                                ${!isComplete && !isCurrent ? "bg-zinc-100 text-zinc-400" : ""}
                                            `}>
                                                    {isComplete ? (
                                                        <Check className="h-4 w-4" />
                                                    ) : isCurrent ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <span className="text-xs font-medium">{index + 1}</span>
                                                    )}
                                                </div>
                                                <span className={`text-xs mt-2 font-medium ${isCurrent || isComplete ? "text-zinc-900" : "text-zinc-400"}`}>
                                                    {step.charAt(0) + step.slice(1).toLowerCase()}
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tabs */}
                    <div className="flex items-center gap-1 mb-6 border-b border-zinc-200 overflow-x-auto">
                        <button
                            onClick={() => setActiveTab("deployments")}
                            className={`px-3 sm:px-4 py-3 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === "deployments"
                                ? "text-zinc-900"
                                : "text-zinc-500 hover:text-zinc-700"
                                }`}
                        >
                            Deployments
                            {activeTab === "deployments" && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab("logs")}
                            className={`px-3 sm:px-4 py-3 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === "logs"
                                ? "text-zinc-900"
                                : "text-zinc-500 hover:text-zinc-700"
                                }`}
                        >
                            Logs
                            {activeTab === "logs" && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab("compute")}
                            className={`px-3 sm:px-4 py-3 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === "compute"
                                ? "text-zinc-900"
                                : "text-zinc-500 hover:text-zinc-700"
                                }`}
                        >
                            Compute
                            {activeTab === "compute" && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab("settings")}
                            className={`px-3 sm:px-4 py-3 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === "settings"
                                ? "text-zinc-900"
                                : "text-zinc-500 hover:text-zinc-700"
                                }`}
                        >
                            Settings
                            {activeTab === "settings" && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />
                            )}
                        </button>
                    </div>

                    {/* Deployments Tab */}
                    {activeTab === "deployments" && (
                        <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
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
                                                    onClick={() => setExpandedDeployId(isExpanded ? null : deployment.deploy_id)}
                                                    className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 hover:bg-zinc-50 transition-colors cursor-pointer"
                                                >
                                                    <div className={`
                                                    w-10 h-10 rounded-xl flex items-center justify-center shrink-0 self-start sm:self-center
                                                    ${deployment.status === "SUCCEEDED" ? "bg-emerald-50" : ""}
                                                    ${deployment.status === "FAILED" ? "bg-red-50" : ""}
                                                    ${deployment.status === "IN_PROGRESS" ? "bg-blue-50" : ""}
                                                `}>
                                                        {deployment.status === "SUCCEEDED" && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                                                        {deployment.status === "FAILED" && <XCircle className="h-5 w-5 text-red-500" />}
                                                        {deployment.status === "IN_PROGRESS" && <Loader2 className="h-5 w-5 text-blue-900 animate-spin" />}
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className="font-mono text-sm font-medium text-zinc-900">
                                                                {deployment.deploy_id}
                                                            </p>
                                                            {isLatest && (
                                                                <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
                                                                    Current
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-zinc-500 mt-0.5">
                                                            {new Date(deployment.started_at).toLocaleDateString("en-US", {
                                                                month: "short",
                                                                day: "numeric",
                                                                year: "numeric",
                                                                hour: "2-digit",
                                                                minute: "2-digit",
                                                            })}
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
                                                        orgId={orgId!}
                                                        status={deployment.status}
                                                        isExpanded={true}
                                                        onToggle={() => setExpandedDeployId(null)}
                                                        onComplete={() => fetchProject()}
                                                    />
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Logs Tab */}
                    {activeTab === "logs" && (
                        <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
                                <div className="flex items-center gap-3">
                                    <Terminal className="h-5 w-5 text-zinc-400" />
                                    <h3 className="font-semibold text-zinc-900">Runtime Logs</h3>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={fetchLogs}
                                    disabled={logsLoading}
                                    className="rounded-full"
                                >
                                    <RefreshCw className={`h-4 w-4 mr-2 ${logsLoading ? 'animate-spin' : ''}`} />
                                    Refresh
                                </Button>
                            </div>

                            <div
                                ref={logsContainerRef}
                                className="h-96 overflow-y-auto bg-zinc-900 p-4 font-mono text-xs"
                            >
                                {logsLoading && logs.length === 0 ? (
                                    <div className="flex items-center justify-center h-full">
                                        <Loader2 className="h-6 w-6 text-zinc-500 animate-spin" />
                                    </div>
                                ) : logs.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                                        <Terminal className="h-8 w-8 mb-3 opacity-50" />
                                        <p>No logs available</p>
                                        <p className="text-zinc-600 text-xs mt-1">
                                            Invoke your function to see runtime logs
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        {logs.map((log, index) => {
                                            const levelColor = log.level === "ERROR"
                                                ? "text-red-400"
                                                : log.level === "WARN"
                                                    ? "text-amber-400"
                                                    : log.level === "SUCCESS"
                                                        ? "text-emerald-400"
                                                        : "text-zinc-300"
                                            return (
                                                <div key={index} className="flex gap-3 leading-relaxed">
                                                    <span className="text-zinc-600 shrink-0 select-none">
                                                        {new Date(log.timestamp).toLocaleTimeString("en-US", {
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                            second: "2-digit",
                                                            hour12: false,
                                                        })}
                                                    </span>
                                                    <span className={levelColor}>
                                                        {log.message}
                                                    </span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="px-6 py-3 border-t border-zinc-100 bg-zinc-50">
                                <p className="text-xs text-zinc-500">
                                    {logs.length} log entries
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Compute Tab */}
                    {activeTab === "compute" && (
                        <div className="space-y-6">
                            <ComputeSettings
                                memory={editingCompute ? memoryValue : (project.memory || 1024)}
                                timeout={editingCompute ? timeoutValue : (project.timeout || 30)}
                                ephemeralStorage={editingCompute ? ephemeralStorageValue : (project.ephemeral_storage || 512)}
                                onMemoryChange={(value) => {
                                    if (!editingCompute) {
                                        startEditingCompute({ memory: value })
                                    } else {
                                        setMemoryValue(value)
                                    }
                                }}
                                onTimeoutChange={(value) => {
                                    if (!editingCompute) {
                                        startEditingCompute({ timeout: value })
                                    } else {
                                        setTimeoutValue(value)
                                    }
                                }}
                                onEphemeralStorageChange={(value) => {
                                    if (!editingCompute) {
                                        startEditingCompute({ ephemeral_storage: value })
                                    } else {
                                        setEphemeralStorageValue(value)
                                    }
                                }}
                                isPro={isPro}
                                onUpgradeClick={openUpgradeModal}
                            />

                            {/* Save Button */}
                            {editingCompute && (
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => setEditingCompute(false)}
                                        className="rounded-full"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={saveCompute}
                                        disabled={savingCompute}
                                        className="bg-zinc-900 hover:bg-zinc-800 rounded-full"
                                    >
                                        {savingCompute && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                        Save Compute Settings
                                    </Button>
                                </div>
                            )}

                            {/* Info Note */}
                            <div className="bg-blue-50 rounded-2xl border border-blue-100 p-6">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                                        <Cpu className="h-5 w-5 text-blue-600" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-blue-900 mb-1">Compute Configuration</h4>
                                        <p className="text-sm text-blue-700">
                                            Changes to compute settings will take effect on the next deployment. Redeploy your project to apply the new configuration.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Settings Tab */}
                    {activeTab === "settings" && (
                        <div className="space-y-6">
                            {/* Start Command */}
                            <StartCommandInput
                                value={editingStartCommand ? startCommandValue : (project.start_command || "")}
                                onChange={setStartCommandValue}
                                disabled={!editingStartCommand}
                                onStartEdit={startEditingStartCommand}
                                isEditMode={editingStartCommand}
                                onSave={saveStartCommand}
                                onCancel={() => setEditingStartCommand(false)}
                                isSaving={savingStartCommand}
                            />

                            {/* Environment Variables */}
                            <EnvironmentVariablesEditor
                                envVars={envVarsList}
                                onChange={setEnvVarsList}
                                showImport={true}
                                readOnly={!editingEnvVars}
                                existingEnvVars={project.env_vars}
                                onStartEdit={startEditingEnvVars}
                                isEditing={editingEnvVars}
                                onCancelEdit={() => setEditingEnvVars(false)}
                                onSave={saveEnvVars}
                                isSaving={savingEnvVars}
                            />

                            {/* Danger Zone */}
                            <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
                                <div className="px-6 py-4 border-b border-red-100 bg-red-50">
                                    <h3 className="font-semibold text-red-900">Danger Zone</h3>
                                </div>
                                <div className="p-4 sm:p-6">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                        <div>
                                            <p className="font-medium text-zinc-900">Delete this project</p>
                                            <p className="text-sm text-zinc-500">Once deleted, this cannot be undone.</p>
                                        </div>
                                        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className="text-red-600 border-red-200 hover:bg-red-50 rounded-full"
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Delete Project
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent className="max-w-md rounded-2xl">
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle className="text-xl">Delete Project</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This will permanently delete <strong>{project.name}</strong> and all its deployments.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <div className="space-y-4 py-4">
                                                    <div>
                                                        <label className="text-sm text-zinc-600 block mb-2">
                                                            Type <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-800">{project.name}</code> to confirm
                                                        </label>
                                                        <Input
                                                            value={confirmProjectName}
                                                            onChange={(e) => setConfirmProjectName(e.target.value)}
                                                            placeholder={project.name}
                                                            className="font-mono"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-sm text-zinc-600 block mb-2">
                                                            Type <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-800">delete my project</code> to confirm
                                                        </label>
                                                        <Input
                                                            value={confirmPhrase}
                                                            onChange={(e) => setConfirmPhrase(e.target.value)}
                                                            placeholder="delete my project"
                                                        />
                                                    </div>
                                                </div>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={handleDeleteProject}
                                                        disabled={deleting || confirmProjectName !== project.name || confirmPhrase !== "delete my project"}
                                                        className="bg-red-600 hover:bg-red-700 rounded-full"
                                                    >
                                                        {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                                        Delete Project
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>


            {/* Upgrade Modal */}
            <UpgradeModal isOpen={upgradeModalOpen} onClose={closeUpgradeModal} />
        </>
    )
}
