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
    HardDrive,
    Database,
    Shield,
    ShieldCheck,
    ShieldAlert,
    Info,
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
import { CustomDomains } from "@/components/CustomDomains"
import { LazyLog, ScrollFollow } from "@melloware/react-logviewer"
import { useIsPro } from "@/hooks/use-is-pro"
import { trackEvent } from "@/lib/amplitude"
import { fetchDatabaseConnection, DatabaseConnection, fetchSecurityRules, addSecurityRule, deleteSecurityRule, SecurityRulesResponse } from "@/lib/api"
import { DatabaseExplorer } from "@/components/DatabaseExplorer"


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
    is_throttled?: boolean
    project_type?: "web-app" | "database"
    db_cluster_identifier?: string | null
    db_endpoint?: string | null
    db_port?: number | null
    db_name?: string | null
    db_master_username?: string | null
    min_acu?: number | null
    max_acu?: number | null
}

interface Deployment {
    deploy_id: string
    build_id: string
    status: "IN_PROGRESS" | "SUCCEEDED" | "FAILED"
    started_at: string
    finished_at: string | null
    commit_sha: string | null
    commit_message: string | null
    commit_author_name: string | null
    commit_author_username: string | null
    branch: string | null
}

interface CustomDomain {
    domain: string
    status: "PENDING_VERIFICATION" | "ACTIVE" | "FAILED"
    is_active: boolean
    tenant_id: string | null
    created_at: string
}

interface ProjectDetails {
    project: Project
    deployments: Deployment[]
    custom_domains: CustomDomain[]
}

const STATUS_CONFIG: Record<string, { dot: string; label: string; color: string; bgGlow: string }> = {
    PENDING: { dot: "bg-zinc-400", label: "Queued", color: "text-zinc-600", bgGlow: "" },
    CLONING: { dot: "bg-blue-500", label: "Cloning", color: "text-blue-600", bgGlow: "shadow-blue-500/20" },
    PREPARING: { dot: "bg-blue-500", label: "Preparing", color: "text-blue-600", bgGlow: "shadow-blue-500/20" },
    UPLOADING: { dot: "bg-blue-600", label: "Uploading", color: "text-blue-600", bgGlow: "shadow-blue-500/20" },
    BUILDING: { dot: "bg-blue-900", label: "Building", color: "text-blue-900", bgGlow: "shadow-blue-900/20" },
    DEPLOYING: { dot: "bg-blue-900", label: "Deploying", color: "text-blue-900", bgGlow: "shadow-blue-900/20" },
    PROVISIONING: { dot: "bg-blue-500", label: "Provisioning", color: "text-blue-600", bgGlow: "shadow-blue-500/20" },
    LIVE: { dot: "bg-emerald-500", label: "Live", color: "text-emerald-600", bgGlow: "shadow-emerald-500/30" },
    FAILED: { dot: "bg-red-500", label: "Failed", color: "text-red-600", bgGlow: "shadow-red-500/20" },
    DELETING: { dot: "bg-red-400", label: "Deleting", color: "text-red-500", bgGlow: "shadow-red-400/20" },
}

// Include PENDING as the first step so users can see that a redeploy has been queued
const BUILD_STEPS = ["PENDING", "CLONING", "PREPARING", "UPLOADING", "BUILDING", "DEPLOYING"]

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
    const [activeTab, setActiveTab] = useState<"deployments" | "domains" | "logs" | "compute" | "settings" | "configuration" | "explorer" | "security">("deployments")

    // Database project state
    const [dbConnection, setDbConnection] = useState<DatabaseConnection | null>(null)
    const [showPassword, setShowPassword] = useState(false)
    const [loadingConnection, setLoadingConnection] = useState(false)
    const [copiedField, setCopiedField] = useState<string | null>(null)

    // Security rules state
    const [securityRules, setSecurityRules] = useState<SecurityRulesResponse | null>(null)
    const [loadingRules, setLoadingRules] = useState(false)
    const [addingRule, setAddingRule] = useState(false)
    const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null)
    const [newIpCidr, setNewIpCidr] = useState("")
    const [newIpLabel, setNewIpLabel] = useState("")
    const [userIp, setUserIp] = useState<string | null>(null)
    const [togglingAccess, setTogglingAccess] = useState(false)

    // Pro tier check via Autumn
    const { isPro, currentPlan } = useIsPro()
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

            // 202 = async deletion (database projects) — optimistically show DELETING status immediately
            if (response.status === 202) {
                setDeleteDialogOpen(false)
                setConfirmProjectName("")
                setConfirmPhrase("")
                setDeleting(false)
                // Optimistic update: set status to DELETING instantly so UI reflects it without waiting for a re-fetch
                setData(prev => prev ? { ...prev, project: { ...prev.project, status: "DELETING" } } : prev)
                return
            }

            // 200 = synchronous deletion (web-app projects) — redirect immediately
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

    // ── Custom Domain Actions ────────────────────────────────────

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
                // Project was deleted (async deletion completed) — redirect to projects list
                if (response.status === 404 && data?.project?.status === "DELETING") {
                    router.push("/projects")
                    return
                }
                const errorData = await response.json()
                if (response.status === 401 && errorData.detail === "Token expired") {
                    signOut({ redirectUrl: "/sign-in" })
                    return
                }
                throw new Error(errorData.detail || "Failed to fetch project")
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

    const isDatabaseProject = data?.project?.project_type === "database"
    const dbActiveTab = activeTab === "configuration" || activeTab === "settings" || activeTab === "explorer" || activeTab === "security" ? activeTab : "configuration"

    const loadSecurityRules = useCallback(async () => {
        const projectId = data?.project?.project_id
        if (!projectId || !orgId) return
        setLoadingRules(true)
        try {
            const token = await getToken()
            if (token) {
                const rules = await fetchSecurityRules(token, projectId, orgId)
                setSecurityRules(rules)
            }
        } catch (err) {
            console.error("Failed to fetch security rules:", err)
        } finally {
            setLoadingRules(false)
        }
    }, [data?.project?.project_id, orgId, getToken])

    useEffect(() => {
        if (isDatabaseProject && dbActiveTab === "security" && !securityRules && !loadingRules) {
            loadSecurityRules()
        }
    }, [isDatabaseProject, dbActiveTab, securityRules, loadingRules, loadSecurityRules])

    // Detect user's public IP on mount (for "Add my IP" feature)
    useEffect(() => {
        fetch("https://api.ipify.org?format=json")
            .then(res => res.json())
            .then(data => setUserIp(data.ip))
            .catch(() => setUserIp(null))
    }, [])

    // Loading skeleton
    if (loading) {
        return (
            <div className="min-h-screen bg-white">
                <div className="px-4 sm:px-6 lg:px-8 py-6">
                    <div className="animate-pulse">
                        <div className="h-4 w-20 bg-zinc-200 rounded mb-8" />
                        <div className="h-10 w-64 bg-zinc-200 rounded-none mb-2" />
                        <div className="h-5 w-48 bg-zinc-100 rounded mb-8" />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-24 bg-zinc-50 rounded-none border border-zinc-200" />
                            ))}
                        </div>
                        <div className="h-64 bg-zinc-50 rounded-none border border-zinc-200" />
                    </div>
                </div>
            </div>
        )
    }

    if (error || !data) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
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

    // ── Database Project View ──────────────────────────────────────
    const copyFieldToClipboard = (text: string, field: string) => {
        navigator.clipboard.writeText(text)
        setCopiedField(field)
        setTimeout(() => setCopiedField(null), 2000)
    }

    const handleShowPassword = async () => {
        if (dbConnection) {
            setShowPassword(!showPassword)
            return
        }
        setLoadingConnection(true)
        try {
            const token = await getToken()
            if (token && orgId) {
                const conn = await fetchDatabaseConnection(token, project.project_id, orgId)
                setDbConnection(conn)
                setShowPassword(true)
            }
        } catch (err) {
            console.error("Failed to fetch database connection:", err)
        } finally {
            setLoadingConnection(false)
        }
    }


    // Derive access mode from rules: "open" if 0.0.0.0/0 exists in inbound
    const isOpenAccess = securityRules?.inbound?.some(
        rule => rule.cidr_ipv4 === "0.0.0.0/0" && rule.protocol === "tcp" && rule.from_port === 5432
    ) ?? true

    // Filter inbound rules to only show user-added IPs (not 0.0.0.0/0)
    const userIpRules = securityRules?.inbound?.filter(
        rule => rule.cidr_ipv4 !== "0.0.0.0/0" && rule.protocol === "tcp" && rule.from_port === 5432
    ) ?? []

    // Find the 0.0.0.0/0 rule ID (for toggling)
    const openAccessRule = securityRules?.inbound?.find(
        rule => rule.cidr_ipv4 === "0.0.0.0/0" && rule.protocol === "tcp" && rule.from_port === 5432
    )

    const handleToggleAccessMode = async (mode: "open" | "restricted") => {
        if (!project?.project_id || !orgId) return
        setTogglingAccess(true)
        try {
            const token = await getToken()
            if (!token) return

            if (mode === "open" && !isOpenAccess) {
                // Add 0.0.0.0/0 rule
                await addSecurityRule(token, project.project_id, orgId, {
                    direction: "inbound",
                    protocol: "tcp",
                    from_port: 5432,
                    to_port: 5432,
                    cidr: "0.0.0.0/0",
                    description: "PostgreSQL public access",
                })
            } else if (mode === "restricted" && isOpenAccess && openAccessRule) {
                // Remove 0.0.0.0/0 rule
                await deleteSecurityRule(token, project.project_id, orgId, openAccessRule.rule_id, "inbound")
            }
            await loadSecurityRules()
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to update access mode"
            alert(message)
        } finally {
            setTogglingAccess(false)
        }
    }

    const handleAddIp = async (cidr?: string, label?: string) => {
        const ipToAdd = cidr || newIpCidr
        const labelToUse = label || newIpLabel
        if (!project?.project_id || !orgId || !ipToAdd) return
        setAddingRule(true)
        try {
            const token = await getToken()
            if (token) {
                // Ensure CIDR notation
                const cidrValue = ipToAdd.includes("/") ? ipToAdd : `${ipToAdd}/32`
                await addSecurityRule(token, project.project_id, orgId, {
                    direction: "inbound",
                    protocol: "tcp",
                    from_port: 5432,
                    to_port: 5432,
                    cidr: cidrValue,
                    description: labelToUse || undefined,
                })
                setNewIpCidr("")
                setNewIpLabel("")
                await loadSecurityRules()
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to add IP"
            alert(message)
        } finally {
            setAddingRule(false)
        }
    }

    const handleDeleteRule = async (ruleId: string) => {
        if (!project?.project_id || !orgId) return
        setDeletingRuleId(ruleId)
        try {
            const token = await getToken()
            if (token) {
                await deleteSecurityRule(token, project.project_id, orgId, ruleId, "inbound")
                await loadSecurityRules()
            }
        } catch (err) {
            console.error("Failed to delete rule:", err)
        } finally {
            setDeletingRuleId(null)
        }
    }

    if (project?.project_type === "database") {
        return (
            <>
                <div className="min-h-screen bg-white">
                    <div className="px-4 sm:px-6 lg:px-8">
                        {/* Breadcrumb */}
                        <div className="flex items-center gap-2 pt-5 pb-4">
                            <Link
                                href="/projects"
                                className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-900 transition-colors group"
                            >
                                <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
                                <span>Projects</span>
                            </Link>
                            <span className="text-zinc-300">/</span>
                            <span className="text-sm text-zinc-900 font-medium truncate">{project.name}</span>
                        </div>

                        {/* Header */}
                        <div className="flex items-center gap-3 py-3 mb-4">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                <Database className="h-5 w-5 text-zinc-400 shrink-0" />
                                <h1 className="text-xl font-semibold text-zinc-900 tracking-tight truncate">{project.name}</h1>
                                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-50 border border-zinc-200 shrink-0 ${statusConfig.bgGlow}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot} ${isBuilding ? 'animate-pulse' : ''}`} />
                                    <span className={`text-xs font-medium ${statusConfig.color}`}>{statusConfig.label}</span>
                                </div>
                            </div>
                        </div>

                        {/* Deleting Banner */}
                        {project.status === "DELETING" && (
                            <div className="bg-red-50 border border-red-200 rounded-none p-4 mb-6 sm:mb-8">
                                <div className="flex items-center gap-3">
                                    <Loader2 className="h-5 w-5 text-red-500 animate-spin shrink-0" />
                                    <div>
                                        <p className="font-medium text-red-900">Deleting database...</p>
                                        <p className="text-sm text-red-600 mt-0.5">This will take a few minutes. You can safely navigate away.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Connection Details Card */}
                        {project.status !== "DELETING" && (
                            <div className="bg-zinc-50 rounded-none border border-zinc-200 p-4 sm:p-5 mb-6 sm:mb-8">
                                <div className="flex items-center gap-2 text-zinc-500 mb-3">
                                    <Database className="h-4 w-4" />
                                    <span className="text-xs font-medium uppercase tracking-wider">Connection Details</span>
                                </div>
                                {project.status === "LIVE" ? (
                                    <div className="space-y-0">
                                        {/* Host */}
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 py-2 border-b border-zinc-100 last:border-0">
                                            <span className="text-sm text-zinc-500 shrink-0">Host</span>
                                            <div className="flex items-center gap-2 min-w-0">
                                                <code className="text-sm font-mono text-zinc-900 truncate">{project.db_endpoint}</code>
                                                <button onClick={() => copyFieldToClipboard(project.db_endpoint || "", "host")} className="p-1 hover:bg-zinc-100 rounded shrink-0">
                                                    {copiedField === "host" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
                                                </button>
                                            </div>
                                        </div>
                                        {/* Port */}
                                        <div className="flex items-center justify-between py-2 border-b border-zinc-100 last:border-0">
                                            <span className="text-sm text-zinc-500">Port</span>
                                            <div className="flex items-center gap-2">
                                                <code className="text-sm font-mono text-zinc-900">{project.db_port || 5432}</code>
                                                <button onClick={() => copyFieldToClipboard(String(project.db_port || 5432), "port")} className="p-1 hover:bg-zinc-100 rounded">
                                                    {copiedField === "port" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
                                                </button>
                                            </div>
                                        </div>
                                        {/* Database */}
                                        <div className="flex items-center justify-between py-2 border-b border-zinc-100 last:border-0">
                                            <span className="text-sm text-zinc-500">Database</span>
                                            <div className="flex items-center gap-2">
                                                <code className="text-sm font-mono text-zinc-900">{project.db_name || "postgres"}</code>
                                                <button onClick={() => copyFieldToClipboard(project.db_name || "postgres", "database")} className="p-1 hover:bg-zinc-100 rounded">
                                                    {copiedField === "database" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
                                                </button>
                                            </div>
                                        </div>
                                        {/* Username */}
                                        <div className="flex items-center justify-between py-2 border-b border-zinc-100 last:border-0">
                                            <span className="text-sm text-zinc-500">Username</span>
                                            <div className="flex items-center gap-2">
                                                <code className="text-sm font-mono text-zinc-900">{project.db_master_username || "admin"}</code>
                                                <button onClick={() => copyFieldToClipboard(project.db_master_username || "admin", "username")} className="p-1 hover:bg-zinc-100 rounded">
                                                    {copiedField === "username" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
                                                </button>
                                            </div>
                                        </div>
                                        {/* Password */}
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 py-2 border-b border-zinc-100 last:border-0">
                                            <span className="text-sm text-zinc-500 shrink-0">Password</span>
                                            <div className="flex items-center gap-2 min-w-0">
                                                {showPassword && dbConnection ? (
                                                    <>
                                                        <code className="text-sm font-mono text-zinc-900 truncate">{dbConnection.password}</code>
                                                        <button onClick={() => copyFieldToClipboard(dbConnection.password, "password")} className="p-1 hover:bg-zinc-100 rounded shrink-0">
                                                            {copiedField === "password" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
                                                        </button>
                                                    </>
                                                ) : (
                                                    <code className="text-sm font-mono text-zinc-400">{"••••••••••••"}</code>
                                                )}
                                                <button
                                                    onClick={handleShowPassword}
                                                    disabled={loadingConnection}
                                                    className="p-1 hover:bg-zinc-100 rounded shrink-0"
                                                >
                                                    {loadingConnection ? (
                                                        <Loader2 className="h-3.5 w-3.5 text-zinc-400 animate-spin" />
                                                    ) : showPassword ? (
                                                        <EyeOff className="h-3.5 w-3.5 text-zinc-400" />
                                                    ) : (
                                                        <Eye className="h-3.5 w-3.5 text-zinc-400" />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                        {/* Connection String */}
                                        {showPassword && dbConnection && (
                                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 py-2">
                                                <span className="text-sm text-zinc-500 shrink-0">Connection String</span>
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <code className="text-sm font-mono text-zinc-900 truncate">{dbConnection.connection_string}</code>
                                                    <button onClick={() => copyFieldToClipboard(dbConnection.connection_string, "connection_string")} className="p-1 hover:bg-zinc-100 rounded shrink-0">
                                                        {copiedField === "connection_string" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-zinc-400 text-sm">
                                        {isBuilding ? "Provisioning database..." : "Database not available"}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Provisioning Progress — not shown during deletion */}
                        {isBuilding && project.status !== "DELETING" && (
                            <div className="bg-zinc-50 rounded-none border border-zinc-200 p-6 mb-8 overflow-hidden">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-none bg-blue-900 flex items-center justify-center">
                                        <Zap className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-zinc-900">Provisioning your database</h3>
                                        <p className="text-sm text-zinc-500">This may take a few minutes...</p>
                                    </div>
                                    <Loader2 className="h-5 w-5 text-blue-900 animate-spin ml-auto" />
                                </div>
                            </div>
                        )}

                        {/* Tabs + Content — hidden while deleting */}
                        {project.status !== "DELETING" && (<>
                            <div className="sticky top-14 z-40 bg-white -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
                                <div className="flex items-center gap-1 border-b border-zinc-200 overflow-x-auto">
                                    <button
                                        onClick={() => setActiveTab("configuration")}
                                        className={`px-3 sm:px-4 py-3 text-sm font-medium transition-colors relative whitespace-nowrap ${dbActiveTab === "configuration"
                                            ? "text-zinc-900"
                                            : "text-zinc-500 hover:text-zinc-700"
                                            }`}
                                    >
                                        Configuration
                                        {dbActiveTab === "configuration" && (
                                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />
                                        )}
                                    </button>
                                    <button
                                        onClick={() => setActiveTab("explorer")}
                                        className={`px-3 sm:px-4 py-3 text-sm font-medium transition-colors relative whitespace-nowrap ${dbActiveTab === "explorer"
                                            ? "text-zinc-900"
                                            : "text-zinc-500 hover:text-zinc-700"
                                            }`}
                                    >
                                        Explorer
                                        {dbActiveTab === "explorer" && (
                                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />
                                        )}
                                    </button>
                                    <button
                                        onClick={() => setActiveTab("security")}
                                        className={`px-3 sm:px-4 py-3 text-sm font-medium transition-colors relative whitespace-nowrap ${dbActiveTab === "security"
                                            ? "text-zinc-900"
                                            : "text-zinc-500 hover:text-zinc-700"
                                            }`}
                                    >
                                        Security
                                        {dbActiveTab === "security" && (
                                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />
                                        )}
                                    </button>
                                    <button
                                        onClick={() => setActiveTab("settings")}
                                        className={`px-3 sm:px-4 py-3 text-sm font-medium transition-colors relative whitespace-nowrap ${dbActiveTab === "settings"
                                            ? "text-zinc-900"
                                            : "text-zinc-500 hover:text-zinc-700"
                                            }`}
                                    >
                                        Settings
                                        {dbActiveTab === "settings" && (
                                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div className="py-6">
                                {/* Configuration Tab */}
                                {dbActiveTab === "configuration" && (
                                    <div className="bg-zinc-50 rounded-none border border-zinc-200 p-6">
                                        <div className="flex items-center gap-3 mb-4">
                                            <Database className="h-5 w-5 text-zinc-400" />
                                            <h3 className="font-semibold text-zinc-900">Database Information</h3>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Cluster</span>
                                                <p className="text-sm text-zinc-900 font-mono mt-1">{project.db_cluster_identifier || "—"}</p>
                                            </div>
                                            <div>
                                                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Engine</span>
                                                <p className="text-sm text-zinc-900 mt-1">PostgreSQL</p>
                                            </div>
                                            <div>
                                                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Min ACU</span>
                                                <p className="text-sm text-zinc-900 mt-1">{project.min_acu ?? "—"}</p>
                                            </div>
                                            <div>
                                                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Max ACU</span>
                                                <p className="text-sm text-zinc-900 mt-1">{project.max_acu ?? "—"}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Explorer Tab */}
                                {dbActiveTab === "explorer" && (
                                    <DatabaseExplorer
                                        projectId={project.project_id}
                                        orgId={orgId ?? null}
                                        projectStatus={project.status}
                                    />
                                )}

                                {/* Security Tab */}
                                {dbActiveTab === "security" && (
                                    <div className="space-y-6">
                                        {/* Header */}
                                        <div className="bg-zinc-50 rounded-none border border-zinc-200 p-4 sm:p-6">
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-3">
                                                    <Shield className="h-5 w-5 text-zinc-400" />
                                                    <h3 className="font-semibold text-zinc-900">Network Access</h3>
                                                </div>
                                                <button
                                                    onClick={loadSecurityRules}
                                                    disabled={loadingRules}
                                                    className="text-zinc-400 hover:text-zinc-600 transition-colors"
                                                >
                                                    <RefreshCw className={`h-4 w-4 ${loadingRules ? "animate-spin" : ""}`} />
                                                </button>
                                            </div>
                                            <p className="text-sm text-zinc-500 ml-8">Control which IP addresses can connect to your database. SSL/TLS is always enforced.</p>
                                        </div>

                                        {loadingRules && !securityRules ? (
                                            <div className="flex items-center justify-center py-12">
                                                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                                            </div>
                                        ) : (
                                            <>
                                                {/* Access Mode Toggle */}
                                                <div className="bg-zinc-50 rounded-none border border-zinc-200 p-4 sm:p-6">
                                                    <h4 className="text-sm font-medium text-zinc-900 mb-4">Access Mode</h4>
                                                    <div className="space-y-3">
                                                        {/* Open Mode */}
                                                        <button
                                                            onClick={() => handleToggleAccessMode("open")}
                                                            disabled={togglingAccess || isOpenAccess}
                                                            className={`w-full text-left px-4 py-3 border transition-colors ${isOpenAccess
                                                                ? "border-zinc-900 bg-white"
                                                                : "border-zinc-200 bg-white hover:border-zinc-300"
                                                                }`}
                                                        >
                                                            <div className="flex items-start gap-3">
                                                                <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${isOpenAccess ? "border-zinc-900" : "border-zinc-300"
                                                                    }`}>
                                                                    {isOpenAccess && <div className="w-2 h-2 rounded-full bg-zinc-900" />}
                                                                </div>
                                                                <div>
                                                                    <div className="flex items-center gap-2">
                                                                        <ShieldCheck className="h-4 w-4 text-emerald-500" />
                                                                        <span className="text-sm font-medium text-zinc-900">Open</span>
                                                                        <span className="text-xs text-zinc-400 bg-zinc-100 px-1.5 py-0.5">Recommended</span>
                                                                    </div>
                                                                    <p className="text-xs text-zinc-500 mt-1">
                                                                        Any IP with valid credentials can connect. Your Shorlabs backends connect automatically.
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </button>

                                                        {/* Restricted Mode */}
                                                        <button
                                                            onClick={() => handleToggleAccessMode("restricted")}
                                                            disabled={togglingAccess || !isOpenAccess}
                                                            className={`w-full text-left px-4 py-3 border transition-colors ${!isOpenAccess
                                                                ? "border-zinc-900 bg-white"
                                                                : "border-zinc-200 bg-white hover:border-zinc-300"
                                                                }`}
                                                        >
                                                            <div className="flex items-start gap-3">
                                                                <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${!isOpenAccess ? "border-zinc-900" : "border-zinc-300"
                                                                    }`}>
                                                                    {!isOpenAccess && <div className="w-2 h-2 rounded-full bg-zinc-900" />}
                                                                </div>
                                                                <div>
                                                                    <div className="flex items-center gap-2">
                                                                        <ShieldAlert className="h-4 w-4 text-amber-500" />
                                                                        <span className="text-sm font-medium text-zinc-900">Restricted</span>
                                                                    </div>
                                                                    <p className="text-xs text-zinc-500 mt-1">
                                                                        Only specific IP addresses can connect.
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </button>
                                                    </div>

                                                    {togglingAccess && (
                                                        <div className="flex items-center gap-2 mt-3 text-sm text-zinc-500">
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                            Updating access mode...
                                                        </div>
                                                    )}

                                                    {/* Warning for restricted mode */}
                                                    {!isOpenAccess && (
                                                        <div className="flex items-start gap-2.5 mt-4 px-3 py-2.5 bg-amber-50 border border-amber-200">
                                                            <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                                                            <p className="text-xs text-amber-800">
                                                                <strong>Heads up:</strong> Shorlabs-deployed backends use dynamic IPs. If you restrict access, your Shorlabs backend may not be able to connect to this database. Add your backend&apos;s IPs below or switch back to Open.
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Allowed IPs Section — shown when restricted */}
                                                {!isOpenAccess && (
                                                    <div className="bg-zinc-50 rounded-none border border-zinc-200 p-4 sm:p-6">
                                                        <h4 className="text-sm font-medium text-zinc-900 mb-4">Allowed IPs</h4>

                                                        {/* IP List */}
                                                        {userIpRules.length === 0 ? (
                                                            <div className="bg-white border border-zinc-200 rounded-none p-6 flex flex-col items-center justify-center text-center mb-4">
                                                                <Globe className="h-7 w-7 text-zinc-300 mb-2" />
                                                                <p className="text-sm text-zinc-500">No IPs added yet</p>
                                                                <p className="text-xs text-zinc-400 mt-1">
                                                                    Add IP addresses that should be allowed to connect to your database.
                                                                </p>
                                                            </div>
                                                        ) : (
                                                            <div className="bg-white border border-zinc-200 rounded-none overflow-hidden mb-4">
                                                                <table className="w-full text-sm">
                                                                    <thead>
                                                                        <tr className="border-b border-zinc-200 bg-zinc-50">
                                                                            <th className="text-left px-4 py-2 font-medium text-zinc-600">IP / CIDR</th>
                                                                            <th className="text-left px-4 py-2 font-medium text-zinc-600">Label</th>
                                                                            <th className="px-4 py-2 w-10"></th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {userIpRules.map((rule) => (
                                                                            <tr key={rule.rule_id} className="border-b border-zinc-100 last:border-0">
                                                                                <td className="px-4 py-2.5 font-mono text-zinc-700">
                                                                                    {rule.cidr_ipv4 || rule.cidr_ipv6 || "-"}
                                                                                </td>
                                                                                <td className="px-4 py-2.5 text-zinc-500">
                                                                                    {rule.description || "-"}
                                                                                </td>
                                                                                <td className="px-4 py-2.5">
                                                                                    <button
                                                                                        onClick={() => handleDeleteRule(rule.rule_id)}
                                                                                        disabled={deletingRuleId === rule.rule_id}
                                                                                        className="text-zinc-400 hover:text-red-500 transition-colors disabled:opacity-50"
                                                                                    >
                                                                                        {deletingRuleId === rule.rule_id ? (
                                                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                                                        ) : (
                                                                                            <Trash2 className="h-4 w-4" />
                                                                                        )}
                                                                                    </button>
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}

                                                        {/* Add IP Form */}
                                                        <div className="border-t border-zinc-200 pt-4">
                                                            <h4 className="text-sm font-medium text-zinc-700 mb-3">Add IP Address</h4>
                                                            <div className="flex flex-col sm:flex-row gap-3">
                                                                <Input
                                                                    placeholder="IP or CIDR (e.g. 203.0.113.0/24)"
                                                                    value={newIpCidr}
                                                                    onChange={(e) => setNewIpCidr(e.target.value)}
                                                                    className="rounded-none flex-1"
                                                                />
                                                                <Input
                                                                    placeholder="Label (optional)"
                                                                    value={newIpLabel}
                                                                    onChange={(e) => setNewIpLabel(e.target.value)}
                                                                    className="rounded-none flex-1 sm:max-w-[200px]"
                                                                />
                                                                <Button
                                                                    onClick={() => handleAddIp()}
                                                                    disabled={addingRule || !newIpCidr}
                                                                    className="rounded-none shrink-0"
                                                                >
                                                                    {addingRule ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                                                                    Add
                                                                </Button>
                                                            </div>
                                                        </div>

                                                        {/* Add My IP shortcut */}
                                                        {userIp && (
                                                            <div className="flex items-center gap-2 mt-4 px-3 py-2.5 bg-blue-50 border border-blue-200">
                                                                <Info className="h-4 w-4 text-blue-500 shrink-0" />
                                                                <span className="text-xs text-blue-800">Your current IP: <code className="font-mono bg-blue-100 px-1 py-0.5">{userIp}</code></span>
                                                                <button
                                                                    onClick={() => handleAddIp(userIp, "My IP")}
                                                                    disabled={addingRule || userIpRules.some(r => r.cidr_ipv4 === `${userIp}/32`)}
                                                                    className="ml-auto text-xs font-medium text-blue-700 hover:text-blue-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                                                                >
                                                                    {userIpRules.some(r => r.cidr_ipv4 === `${userIp}/32`) ? "✓ Added" : "+ Add my IP"}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* SSL info — always shown */}
                                                <div className="bg-zinc-50 rounded-none border border-zinc-200 p-4 sm:p-6">
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <ShieldCheck className="h-5 w-5 text-emerald-500" />
                                                        <h4 className="text-sm font-medium text-zinc-900">Encryption</h4>
                                                    </div>
                                                    <p className="text-sm text-zinc-500 ml-8">
                                                        All connections use SSL/TLS encryption. Credentials are managed and auto-rotated via AWS Secrets Manager.
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* Settings Tab */}
                                {dbActiveTab === "settings" && (
                                    <div className="space-y-6">
                                        {/* Danger Zone */}
                                        <div className="bg-zinc-50 rounded-none border border-red-200 overflow-hidden">
                                            <div className="px-6 py-4 border-b border-red-100 bg-red-50">
                                                <h3 className="font-semibold text-red-900">Danger Zone</h3>
                                            </div>
                                            <div className="p-4 sm:p-6">
                                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                                    <div>
                                                        <p className="font-medium text-zinc-900">Delete this database</p>
                                                        <p className="text-sm text-zinc-500">Once deleted, this cannot be undone. All data will be permanently lost.</p>
                                                    </div>
                                                    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                                                        <AlertDialogTrigger asChild>
                                                            <Button
                                                                variant="outline"
                                                                className="text-red-600 border-red-200 hover:bg-red-50 rounded-full"
                                                            >
                                                                <Trash2 className="h-4 w-4 mr-2" />
                                                                Delete Database
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent className="max-w-md rounded-none">
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle className="text-xl">Delete Database</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    This will permanently delete <strong>{project.name}</strong> and all its data.
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
                                                                    Delete Database
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
                        </>)}
                    </div>
                </div>

                <UpgradeModal isOpen={upgradeModalOpen} onClose={closeUpgradeModal} />
            </>
        )
    }

    // Prefer active custom domain over the default shorlabs URL
    const activeCustomDomain = data.custom_domains?.find(d => d.is_active)
    const displayUrl = activeCustomDomain
        ? `https://${activeCustomDomain.domain}`
        : (project.custom_url || project.function_url)

    return (
        <>
            <div className="min-h-screen bg-white">
                <div className="px-4 sm:px-6 lg:px-8">
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-2 pt-5 pb-4">
                        <Link
                            href="/projects"
                            className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-900 transition-colors group"
                        >
                            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
                            <span>Projects</span>
                        </Link>
                        <span className="text-zinc-300">/</span>
                        <span className="text-sm text-zinc-900 font-medium truncate">{project.name}</span>
                    </div>

                    {/* Header — compact single row */}
                    <div className="flex items-center gap-3 py-3 mb-4">
                        {/* Name + status */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                            <h1 className="text-xl font-semibold text-zinc-900 tracking-tight truncate">{project.name}</h1>
                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-50 border border-zinc-200 shrink-0 ${statusConfig.bgGlow}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot} ${isBuilding ? 'animate-pulse' : ''}`} />
                                <span className={`text-xs font-medium ${statusConfig.color}`}>{statusConfig.label}</span>
                            </div>
                            <a
                                href={project.github_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hidden sm:inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-900 transition-colors shrink-0"
                            >
                                <Github className="h-3.5 w-3.5" />
                                <span className="font-mono text-xs">{project.github_repo}</span>
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        </div>

                        {/* Redeploy button */}
                        <Button
                            onClick={handleRedeploy}
                            disabled={isBuilding || redeploying || project.is_throttled}
                            className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-full h-9 px-4 text-sm shrink-0"
                            title={
                                project.is_throttled
                                    ? "Redeploy is paused while your organization is over quota."
                                    : isBuilding
                                        ? "A deployment is in progress — will auto-queue."
                                        : "Trigger a new deployment."
                            }
                        >
                            <RotateCw className={`h-3.5 w-3.5 mr-1.5 ${redeploying ? 'animate-spin' : ''}`} />
                            {project.is_throttled ? "Paused" : "Redeploy"}
                        </Button>
                    </div>

                    {/* Throttle Banner */}
                    {project.is_throttled && (
                        <div className="bg-red-50 border border-red-200 rounded-none p-5 mb-6">
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-none bg-red-100 flex items-center justify-center shrink-0">
                                    <AlertCircle className="h-5 w-5 text-red-500" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-semibold text-red-900">Project Paused</h3>
                                    <p className="text-sm text-red-700 mt-1">
                                        This project is paused because your organization has exceeded its Hobby plan quota.
                                        Your endpoint will return errors until you upgrade or the billing period resets.
                                    </p>
                                    <Button
                                        onClick={openUpgradeModal}
                                        className="mt-3 bg-red-600 hover:bg-red-700 text-white rounded-full h-9 px-4 text-sm"
                                    >
                                        Upgrade to Restore
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Stats Cards */}
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
                                        onClick={() => copyToClipboard(displayUrl)}
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

                    {/* Build Progress - Only show when building */}
                    {isBuilding && (
                        <div className="bg-zinc-50 rounded-none border border-zinc-200 p-4 sm:p-6 mb-6 sm:mb-8 overflow-hidden">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-none bg-blue-900 flex items-center justify-center shrink-0">
                                        <Zap className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-zinc-900">Building your project</h3>
                                        <p className="text-sm text-zinc-500">Step {currentStepIndex + 1} of {BUILD_STEPS.length}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Progress Steps */}
                            <div className="relative overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
                                <div className="relative min-w-[400px]">
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
                                                    w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center z-10 transition-all
                                                    ${isComplete ? "bg-zinc-900 text-white" : ""}
                                                    ${isCurrent ? "bg-zinc-900 text-white ring-4 ring-zinc-100" : ""}
                                                    ${!isComplete && !isCurrent ? "bg-zinc-100 text-zinc-400" : ""}
                                                `}>
                                                        {isComplete ? (
                                                            <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                                        ) : isCurrent ? (
                                                            <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                                                        ) : (
                                                            <span className="text-xs font-medium">{index + 1}</span>
                                                        )}
                                                    </div>
                                                    <span className={`text-[10px] sm:text-xs mt-2 font-medium ${isCurrent || isComplete ? "text-zinc-900" : "text-zinc-400"}`}>
                                                        {step.charAt(0) + step.slice(1).toLowerCase()}
                                                    </span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tabs — sticky */}
                    <div className="sticky top-14 z-40 bg-white -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
                        <div className="flex items-center gap-1 border-b border-zinc-200 overflow-x-auto">
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
                                onClick={() => setActiveTab("domains")}
                                className={`px-3 sm:px-4 py-3 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === "domains"
                                    ? "text-zinc-900"
                                    : "text-zinc-500 hover:text-zinc-700"
                                    }`}
                            >
                                Domains
                                {activeTab === "domains" && (
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
                    </div>
                    <div className="py-6">

                        {/* Deployments Tab */}
                        {activeTab === "deployments" && (
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
                                                        onClick={() => setExpandedDeployId(isExpanded ? null : deployment.deploy_id)}
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

                        {/* Domains Tab */}
                        {activeTab === "domains" && (
                            <CustomDomains
                                projectId={id}
                                orgId={orgId ?? null}
                                subdomain={project.subdomain ?? null}
                                customDomains={data?.custom_domains}
                                onRefetch={fetchProject}
                            />
                        )}

                        {/* Logs Tab */}
                        {activeTab === "logs" && (
                            <div className="bg-zinc-50 rounded-none border border-zinc-200 overflow-hidden">
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

                                <div style={{ height: "384px" }}>
                                    {logsLoading && logs.length === 0 ? (
                                        <div className="flex items-center justify-center h-full bg-zinc-50">
                                            <Loader2 className="h-6 w-6 text-zinc-400 animate-spin" />
                                        </div>
                                    ) : logs.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-full bg-zinc-50 text-zinc-400">
                                            <Terminal className="h-8 w-8 mb-3 opacity-40" />
                                            <p className="text-sm">No logs available</p>
                                            <p className="text-zinc-400 text-xs mt-1">
                                                Invoke your function to see runtime logs
                                            </p>
                                        </div>
                                    ) : (
                                        <ScrollFollow
                                            startFollowing
                                            render={({ follow, onScroll }) => (
                                                <LazyLog
                                                    text={logs
                                                        .map((log) => {
                                                            const time = (() => {
                                                                try { return new Date(log.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) }
                                                                catch { return log.timestamp }
                                                            })()
                                                            const tsColor = "\x1b[38;2;161;161;170m" // zinc-400
                                                            const prefix = log.level === "ERROR" ? "\x1b[38;2;220;38;38m" : log.level === "WARN" ? "\x1b[38;2;217;119;6m" : log.level === "SUCCESS" ? "\x1b[38;2;5;150;105m" : "\x1b[38;2;63;63;70m"
                                                            return `${tsColor}${time}\x1b[0m  ${prefix}${log.message}\x1b[0m`
                                                        })
                                                        .join("\n")}
                                                    follow={follow}
                                                    onScroll={onScroll}
                                                    enableSearch
                                                    extraLines={1}
                                                    style={{
                                                        background: "#f4f4f5",
                                                        color: "#3f3f46",
                                                        fontFamily: "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)",
                                                        fontSize: "12px",
                                                        height: "100%",
                                                        width: "100%",
                                                    }}
                                                />
                                            )}
                                        />
                                    )}
                                </div>

                                <div className="px-6 py-3 border-t border-zinc-100 bg-zinc-50">
                                    <p className="text-xs text-zinc-500">
                                        {logs.length} log {logs.length === 1 ? "entry" : "entries"}
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
                                    ephemeralStorage={editingCompute ? ephemeralStorageValue : (project.ephemeral_storage || 1024)}
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
                                    plan={currentPlan ?? "hobby"}
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
                                            className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-full"
                                        >
                                            {savingCompute && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                            Save Compute Settings
                                        </Button>
                                    </div>
                                )}

                                {/* Info Note */}
                                <div className="bg-blue-50 rounded-none border border-blue-100 p-6">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-none bg-blue-100 flex items-center justify-center shrink-0">
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
                                <div className="bg-zinc-50 rounded-none border border-red-200 overflow-hidden">
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
                                                <AlertDialogContent className="max-w-md rounded-none">
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
                    </div>{/* end py-6 tab content */}
                </div>{/* end px-4 padding */}
            </div>{/* end min-h-screen */}

            <UpgradeModal isOpen={upgradeModalOpen} onClose={closeUpgradeModal} />
        </>
    )
}
