"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth, useClerk } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { useIsPro } from "@/hooks/use-is-pro"
import { useUpgradeModal } from "@/components/upgrade-modal"
import { trackEvent } from "@/lib/amplitude"
import { fetchDatabaseConnection, DatabaseConnection, fetchSecurityRules, addSecurityRule, deleteSecurityRule, SecurityRulesResponse } from "@/lib/api"
import { API_BASE_URL } from "./constants"
import type { ProjectDetails, ActiveTab } from "./types"

export function useProjectDetail(id: string) {
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
    const [activeTab, setActiveTab] = useState<ActiveTab>("deployments")

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

    const copyFieldToClipboard = (text: string, field: string) => {
        navigator.clipboard.writeText(text)
        setCopiedField(field)
        setTimeout(() => setCopiedField(null), 2000)
    }

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

    // Database: show password / fetch connection
    const handleShowPassword = async () => {
        if (dbConnection) {
            setShowPassword(!showPassword)
            return
        }
        setLoadingConnection(true)
        try {
            const token = await getToken()
            if (token && orgId) {
                const conn = await fetchDatabaseConnection(token, data!.project.project_id, orgId)
                setDbConnection(conn)
                setShowPassword(true)
            }
        } catch (err) {
            console.error("Failed to fetch database connection:", err)
        } finally {
            setLoadingConnection(false)
        }
    }

    // Security rules
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

    // Derive access mode from rules: "open" if 0.0.0.0/0 exists in inbound
    const isOpenAccess = securityRules?.inbound?.some(
        rule => rule.cidr_ipv4 === "0.0.0.0/0" && rule.protocol === "tcp" && rule.from_port === 5432
    ) ?? true

    // Filter inbound rules to only show user-added IPs (not 0.0.0.0/0)
    const userIpRules = securityRules?.inbound?.filter(
        rule => rule.cidr_ipv4 !== "0.0.0.0/0" && rule.protocol === "tcp" && rule.from_port === 5432
    ) ?? []

    // Find all 0.0.0.0/0 rules (for toggling)
    const openAccessRules = securityRules?.inbound?.filter(
        rule => rule.cidr_ipv4 === "0.0.0.0/0" && rule.protocol === "tcp" && rule.from_port === 5432
    ) ?? []

    const handleToggleAccessMode = async (mode: "open" | "restricted") => {
        if (!data?.project?.project_id || !orgId) return
        setTogglingAccess(true)
        try {
            const token = await getToken()
            if (!token) return

            if (mode === "open" && !isOpenAccess) {
                await addSecurityRule(token, data.project.project_id, orgId, {
                    direction: "inbound",
                    protocol: "tcp",
                    from_port: 5432,
                    to_port: 5432,
                    cidr: "0.0.0.0/0",
                    description: "PostgreSQL public access",
                })
            } else if (mode === "restricted" && isOpenAccess && openAccessRules.length > 0) {
                for (const rule of openAccessRules) {
                    await deleteSecurityRule(token, data.project.project_id, orgId, rule.rule_id, "inbound")
                }
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
        if (!data?.project?.project_id || !orgId || !ipToAdd) return
        setAddingRule(true)
        try {
            const token = await getToken()
            if (token) {
                const cidrValue = ipToAdd.includes("/") ? ipToAdd : `${ipToAdd}/32`
                await addSecurityRule(token, data.project.project_id, orgId, {
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
        if (!data?.project?.project_id || !orgId) return
        setDeletingRuleId(ruleId)
        try {
            const token = await getToken()
            if (token) {
                await deleteSecurityRule(token, data.project.project_id, orgId, ruleId, "inbound")
                await loadSecurityRules()
            }
        } catch (err) {
            console.error("Failed to delete rule:", err)
        } finally {
            setDeletingRuleId(null)
        }
    }

    // ── Effects ──────────────────────────────────────────────────────

    useEffect(() => {
        if (isLoaded && orgId) {
            fetchProject()
        }
    }, [isLoaded, orgId, fetchProject])

    // Poll while build is in progress
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

    // Fetch logs when logs tab is selected
    useEffect(() => {
        if (activeTab === "logs") {
            fetchLogs()
        }
    }, [activeTab, fetchLogs])

    // Load security rules when security tab selected (only when DB is LIVE — no rules exist while provisioning)
    const isDatabaseProject = data?.project?.project_type === "database"
    const dbActiveTab = activeTab === "configuration" || activeTab === "settings" || activeTab === "explorer" || activeTab === "security" ? activeTab : "configuration"
    const isDbLive = data?.project?.status === "LIVE"

    useEffect(() => {
        if (isDatabaseProject && dbActiveTab === "security" && isDbLive && !securityRules && !loadingRules) {
            loadSecurityRules()
        }
    }, [isDatabaseProject, dbActiveTab, isDbLive, securityRules, loadingRules, loadSecurityRules])

    // Detect user's public IP on mount (for "Add my IP" feature)
    useEffect(() => {
        fetch("https://api.ipify.org?format=json")
            .then(res => res.json())
            .then(data => setUserIp(data.ip))
            .catch(() => setUserIp(null))
    }, [])

    return {
        // Core data
        data,
        loading,
        error,
        orgId,
        isPro,
        currentPlan,
        upgradeModalOpen,
        openUpgradeModal,
        closeUpgradeModal,

        // Tab state
        activeTab,
        setActiveTab,
        isDatabaseProject,
        dbActiveTab,

        // Project actions
        fetchProject,
        handleRedeploy,
        redeploying,
        handleDeleteProject,
        deleting,
        deleteDialogOpen,
        setDeleteDialogOpen,
        confirmProjectName,
        setConfirmProjectName,
        confirmPhrase,
        setConfirmPhrase,

        // URL copy
        copied,
        copyToClipboard,

        // Env vars
        editingEnvVars,
        setEditingEnvVars,
        envVarsList,
        setEnvVarsList,
        savingEnvVars,
        startEditingEnvVars,
        saveEnvVars,

        // Start command
        editingStartCommand,
        setEditingStartCommand,
        startCommandValue,
        setStartCommandValue,
        savingStartCommand,
        startEditingStartCommand,
        saveStartCommand,

        // Compute
        editingCompute,
        setEditingCompute,
        memoryValue,
        setMemoryValue,
        timeoutValue,
        setTimeoutValue,
        ephemeralStorageValue,
        setEphemeralStorageValue,
        savingCompute,
        startEditingCompute,
        saveCompute,

        // Logs
        logs,
        logsLoading,
        fetchLogs,

        // Deployments
        expandedDeployId,
        setExpandedDeployId,

        // Database connection
        dbConnection,
        showPassword,
        loadingConnection,
        copiedField,
        copyFieldToClipboard,
        handleShowPassword,

        // Security
        isDbLive,
        securityRules,
        loadingRules,
        loadSecurityRules,
        addingRule,
        deletingRuleId,
        newIpCidr,
        setNewIpCidr,
        newIpLabel,
        setNewIpLabel,
        userIp,
        togglingAccess,
        isOpenAccess,
        userIpRules,
        handleToggleAccessMode,
        handleAddIp,
        handleDeleteRule,
    }
}

export type UseProjectDetailReturn = ReturnType<typeof useProjectDetail>
