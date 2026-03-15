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
import { EnvironmentVariablesEditor, EnvironmentVariablesSecurityNote, type EnvVar } from "@/components/EnvironmentVariablesEditor"
import { StartCommandInput } from "@/components/StartCommandInput"
import { trackEvent } from "@/lib/amplitude"
import { useIsPro } from "@/hooks/use-is-pro"
import { EC2_COMPUTE_OPTIONS, DEFAULT_COMPUTE_INDEX, hasAccessToPlan } from "@/lib/compute-options"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

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

function ConfigureWebServiceContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { getToken, orgId } = useAuth()
    const { signOut } = useClerk()
    const { isPro, currentPlan, isLoaded: isPlanLoaded } = useIsPro()

    const repoFullName = searchParams.get("repo") || ""
    const isPrivateRepo = searchParams.get("private") === "true"
    const existingProjectId = searchParams.get("project_id")
    const isAddService = !!existingProjectId
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

    // Framework detection
    const [detectedFramework, setDetectedFramework] = useState<string | null>(null)
    const [detectingFramework, setDetectingFramework] = useState(true)
    const [detectionConfidence, setDetectionConfidence] = useState<"high" | "medium" | "low">("low")

    // EC2 compute (default: t4g.micro - 2 vCPU / 1 GB)
    const [selectedCompute, setSelectedCompute] = useState(DEFAULT_COMPUTE_INDEX)

    useEffect(() => {
        if (!repoFullName) router.push("/new/web-service")
    }, [repoFullName, router])

    // Redirect hobby users back to /new
    useEffect(() => {
        if (isPlanLoaded && !isPro) {
            router.replace("/new")
        }
    }, [isPlanLoaded, isPro, router])

    const fetchDirectoryContents = useCallback(async (path: string = "") => {
        const token = await getToken({ skipCache: true })
        if (!token) {
            signOut({ redirectUrl: "/sign-in" })
            return []
        }

        try {
            const url = new URL(`${API_BASE_URL}/api/github/repos/${encodeURIComponent(repoFullName)}/contents`)
            if (orgId) url.searchParams.append("org_id", orgId)
            if (path) url.searchParams.append("path", path)

            const response = await fetch(url.toString(), {
                headers: { Authorization: `Bearer ${token}` },
            })

            if (!response.ok) {
                const data = await response.json().catch(() => ({ detail: "Unknown error" }))
                if (response.status === 401 && data.detail === "Token expired") {
                    signOut({ redirectUrl: "/sign-in" })
                    return []
                }
                throw new Error("Failed to fetch directory contents")
            }

            const data = await response.json()
            return data.filter((item: DirectoryItem) => item.type === "dir")
        } catch (err) {
            console.error("Failed to fetch directory:", err)
            return []
        }
    }, [getToken, signOut, repoFullName, orgId])

    const openDirectoryPicker = async () => {
        setShowDirPicker(true)
        setSelectedDir(rootDirectory)

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
            setDirectories(prev => ({
                ...prev,
                [path]: { ...prev[path], expanded: !prev[path].expanded }
            }))
        } else {
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

    // Framework detection
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

            const response = await fetch(url.toString(), {
                headers: { Authorization: `Bearer ${token}` },
            })

            if (response.ok) {
                const data = await response.json()
                if (data.detected && data.suggested_command) {
                    setStartCommand(data.suggested_command)
                    setDetectedFramework(data.framework)
                    setDetectionConfidence(data.confidence)
                } else if (data.detected && data.runtime === "nodejs") {
                    setStartCommand("npm run start")
                    setDetectedFramework(data.framework || "Node.js")
                    setDetectionConfidence("medium")
                } else {
                    setStartCommand("uvicorn main:app --host 0.0.0.0 --port 8080")
                    setDetectedFramework(null)
                    setDetectionConfidence("low")
                }
            }
        } catch (err) {
            console.error("Framework detection failed:", err)
            setStartCommand("uvicorn main:app --host 0.0.0.0 --port 8080")
        } finally {
            setDetectingFramework(false)
        }
    }, [repoFullName, getToken, orgId])

    useEffect(() => {
        if (repoFullName) detectFramework(rootDirectory)
    }, [repoFullName, rootDirectory, detectFramework])

    const handleDeploy = async () => {
        if (!projectName.trim() || !repoFullName) return

        setDeploying(true)
        setError(null)
        try {
            const token = await getToken()
            const compute = EC2_COMPUTE_OPTIONS[selectedCompute]

            // Determine API endpoint
            const serviceUrl = new URL(`${API_BASE_URL}/api/projects/${existingProjectId}/services`)
            if (orgId) serviceUrl.searchParams.append("org_id", orgId)

            let apiUrl: string
            const bodyPayload: Record<string, unknown> = {
                organization_id: orgId || "",
                name: projectName.trim(),
                github_repo: repoFullName,
                root_directory: rootDirectory,
                env_vars: envVars.reduce((acc, { key, value }) => {
                    if (key.trim()) acc[key.trim()] = value
                    return acc
                }, {} as Record<string, string>),
                start_command: startCommand.trim(),
                cpu: compute.cpu,
                memory: compute.memory,
            }

            if (existingProjectId) {
                apiUrl = serviceUrl.toString()
                bodyPayload.service_type = "web-service"
            } else {
                const newUrl = new URL(`${API_BASE_URL}/api/projects/web-service`)
                if (orgId) newUrl.searchParams.append("org_id", orgId)
                apiUrl = newUrl.toString()
            }

            const response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(bodyPayload),
            })

            if (!response.ok) {
                const data = await response.json()
                const detail = data.detail
                const message = typeof detail === "string"
                    ? detail
                    : Array.isArray(detail)
                        ? detail.map((e: { msg?: string }) => e.msg).join(", ")
                        : "Failed to create project"
                throw new Error(message)
            }

            const data = await response.json()
            const projectId = existingProjectId || data.project_id

            trackEvent(existingProjectId ? 'Service Added' : 'Project Created', {
                project_id: projectId,
                project_name: projectName.trim(),
                github_repo: repoFullName,
                service_type: 'web-service',
                cpu: compute.cpu,
                memory_mb: compute.memory,
                env_var_count: envVars.filter(v => v.key.trim()).length,
            })

            router.push(`/projects/${projectId}`)
        } catch (err) {
            console.error("Failed to create project:", err)
            setError(err instanceof Error ? err.message : "Failed to create project")

            trackEvent('Error Occurred', {
                error_type: 'web_service_creation_failed',
                error_message: err instanceof Error ? err.message : 'Unknown error',
                context: 'web_service_deployment'
            })
        } finally {
            setDeploying(false)
        }
    }

    const DirectoryTreeItem = ({ item, depth = 0 }: { item: DirectoryItem; depth?: number }) => {
        const dir = directories[item.path]
        const isExpanded = dir?.expanded
        const isLoading = dir?.loading
        const isSelected = selectedDir === item.path || selectedDir === `./${item.path}`
        const hasChildren = dir?.items && dir.items.length > 0

        return (
            <div>
                <div
                    className={`flex items-center gap-2 py-2.5 px-3 cursor-pointer transition-colors rounded-none mx-2 ${isSelected ? "bg-zinc-100" : "hover:bg-zinc-50"}`}
                    style={{ paddingLeft: `${12 + depth * 20}px` }}
                >
                    <button
                        onClick={(e) => { e.stopPropagation(); toggleDirectory(item.path) }}
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
                    <button
                        onClick={() => setSelectedDir(`./${item.path}`)}
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? "border-zinc-900 bg-zinc-900" : "border-zinc-300 hover:border-zinc-400"}`}
                    >
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </button>
                    {isExpanded ? (
                        <FolderOpen className="h-4 w-4 text-zinc-500 shrink-0" />
                    ) : (
                        <Folder className="h-4 w-4 text-zinc-500 shrink-0" />
                    )}
                    <span className="text-sm text-zinc-900 font-medium truncate">{item.name}</span>
                </div>
                {isExpanded && hasChildren && (
                    <div>
                        {dir.items.map((child) => (
                            <DirectoryTreeItem key={child.path} item={child} depth={depth + 1} />
                        ))}
                    </div>
                )}
            </div>
        )
    }

    if (!repoFullName) return null

    const sections = [
        { id: "general" as const, label: "General", icon: Settings2 },
        { id: "compute" as const, label: "Compute", icon: Cpu },
        { id: "environment" as const, label: "Environment", icon: Code2 },
    ]

    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
                {/* Navigation */}
                <Link
                    href={existingProjectId ? `/new/web-service?project_id=${existingProjectId}` : "/new/web-service"}
                    className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors mb-8 group"
                >
                    <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                    <span>Back to Repositories</span>
                </Link>

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 sm:mb-8">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">Configure Web Service</h1>
                        <p className="text-sm text-zinc-500 mt-1">Review your settings before deploying</p>
                    </div>
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
                </div>

                {/* Source Card */}
                <div className="bg-white rounded-none border border-zinc-200 px-4 py-3 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-none bg-zinc-900 flex items-center justify-center shrink-0">
                            <Github className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-semibold text-zinc-900 truncate">{repoFullName}</div>
                            <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
                                <GitBranch className="h-3 w-3" />
                                <span>main</span>
                                <span className="text-zinc-300">&bull;</span>
                                {isPrivateRepo ? (
                                    <><Lock className="h-3 w-3" /><span>Private</span></>
                                ) : (
                                    <><Globe className="h-3 w-3" /><span>Public</span></>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="flex items-start gap-3 text-sm text-red-600 bg-red-50 p-4 rounded-none border border-red-100 mb-6">
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
                            className={`flex items-center gap-2 px-3 sm:px-4 py-3 text-sm font-medium transition-colors relative whitespace-nowrap ${activeSection === section.id ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-700"}`}
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
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                            <div className="lg:col-span-3 bg-white rounded-none border border-zinc-200 overflow-hidden">
                                <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-zinc-100">
                                    <FileText className="h-5 w-5 text-zinc-400" />
                                    <h3 className="font-semibold text-zinc-900">Service Name</h3>
                                </div>
                                <div className="p-4 sm:p-6">
                                    <Input
                                        value={projectName}
                                        onChange={(e) => setProjectName(e.target.value)}
                                        placeholder="my-web-service"
                                        className="h-12 text-sm border-zinc-200 rounded-none font-medium"
                                    />
                                    <p className="text-xs text-zinc-500 mt-2">Name for your web service</p>
                                </div>
                            </div>
                            <div className="lg:col-span-2 bg-white rounded-none border border-zinc-200 overflow-hidden">
                                <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-zinc-100">
                                    <Folder className="h-5 w-5 text-zinc-400" />
                                    <h3 className="font-semibold text-zinc-900">Root Directory</h3>
                                </div>
                                <div className="p-4 sm:p-6">
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 flex items-center gap-3 bg-zinc-50 rounded-none px-4 py-3.5 border border-zinc-100 min-w-0">
                                            <Folder className="h-4 w-4 text-zinc-400 shrink-0" />
                                            <span className="font-mono text-sm text-zinc-700 truncate">{rootDirectory}</span>
                                        </div>
                                        <Button variant="outline" onClick={openDirectoryPicker} className="h-12 rounded-none shrink-0 px-4">
                                            Edit
                                        </Button>
                                    </div>
                                    <p className="text-xs text-zinc-500 mt-2">For monorepo projects</p>
                                </div>
                            </div>
                        </div>

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
                    <div className="bg-white rounded-none border border-zinc-200 overflow-hidden">
                        <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-zinc-100">
                            <Cpu className="h-5 w-5 text-zinc-400" />
                            <h3 className="font-semibold text-zinc-900">Container Size</h3>
                        </div>
                        <div className="p-4 sm:p-6">
                            <p className="text-sm text-zinc-500 mb-4">
                                Choose the CPU and memory allocation for your container. Your app must listen on port 8080.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {EC2_COMPUTE_OPTIONS.map((option, index) => {
                                    const isLocked = !hasAccessToPlan(currentPlan ?? "hobby", option.minPlan)
                                    return (
                                        <button
                                            key={index}
                                            onClick={() => !isLocked && setSelectedCompute(index)}
                                            className={`relative flex items-center gap-3 p-4 border rounded-none transition-all text-left ${
                                                selectedCompute === index
                                                    ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900"
                                                    : isLocked
                                                        ? "border-zinc-200 bg-zinc-50/50 opacity-75 cursor-not-allowed"
                                                        : "border-zinc-200 hover:border-zinc-400"
                                            }`}
                                        >
                                            {option.badge && (
                                                <span className="absolute -top-2 -right-2 bg-zinc-900 text-white text-xs font-medium px-2 py-0.5 rounded-full">
                                                    {option.badge}
                                                </span>
                                            )}
                                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                                selectedCompute === index ? "border-zinc-900 bg-zinc-900" : "border-zinc-300"
                                            }`}>
                                                {selectedCompute === index && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                            </div>
                                            <div>
                                                <p className={`text-sm font-medium ${isLocked ? 'text-zinc-500' : 'text-zinc-900'}`}>
                                                    {option.cpu / 1024} vCPU / {option.memory >= 1024 ? `${option.memory / 1024} GB` : `${option.memory} MB`}
                                                </p>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Environment Section */}
                {activeSection === "environment" && (
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                        <div className="lg:col-span-3">
                            <EnvironmentVariablesEditor envVars={envVars} onChange={setEnvVars} showImport={true} />
                        </div>
                        <div className="lg:col-span-2">
                            <EnvironmentVariablesSecurityNote />
                        </div>
                    </div>
                )}
            </div>

            {/* Root Directory Picker */}
            <Dialog open={showDirPicker} onOpenChange={setShowDirPicker}>
                <DialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden rounded-none">
                    <DialogHeader className="px-6 pt-6 pb-4 text-center">
                        <DialogTitle className="text-xl font-semibold text-zinc-900">Root Directory</DialogTitle>
                        <p className="text-sm text-zinc-500 mt-2">
                            Select the directory where your source code is located.
                        </p>
                        <div className="flex items-center justify-center gap-2 mt-4">
                            <Github className="h-4 w-4 text-zinc-600" />
                            <span className="text-sm font-medium text-zinc-900">{repoFullName}</span>
                        </div>
                    </DialogHeader>

                    <div className="border-t border-zinc-100 max-h-[320px] overflow-y-auto py-2">
                        <div
                            className={`flex items-center gap-2 py-2.5 px-3 cursor-pointer transition-colors rounded-none mx-2 ${selectedDir === "./" ? "bg-zinc-100" : "hover:bg-zinc-50"}`}
                            onClick={() => setSelectedDir("./")}
                        >
                            <div className="w-5" />
                            <button
                                onClick={() => setSelectedDir("./")}
                                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${selectedDir === "./" ? "border-zinc-900 bg-zinc-900" : "border-zinc-300 hover:border-zinc-400"}`}
                            >
                                {selectedDir === "./" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </button>
                            <Folder className="h-4 w-4 text-zinc-500 shrink-0" />
                            <span className="text-sm text-zinc-900 font-medium">
                                {repoFullName.split("/")[1]} <span className="text-zinc-400 font-normal">(root)</span>
                            </span>
                        </div>

                        {loadingRootDir ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                            </div>
                        ) : (
                            directories["root"]?.items.map((item) => (
                                <DirectoryTreeItem key={item.path} item={item} />
                            ))
                        )}

                        {!loadingRootDir && directories["root"]?.items.length === 0 && (
                            <div className="text-center py-8 text-sm text-zinc-500">No subdirectories found</div>
                        )}
                    </div>

                    <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between">
                        <Button variant="outline" onClick={() => setShowDirPicker(false)} className="rounded-full">Cancel</Button>
                        <Button onClick={confirmDirectorySelection} className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-full px-6">Continue</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

export default function ConfigureWebServicePage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-white flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
        }>
            <ConfigureWebServiceContent />
        </Suspense>
    )
}
