"use client"

import { use, useState } from "react"
import { AlertCircle, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { UpgradeModal } from "@/components/upgrade-modal"
import { CustomDomains } from "@/components/CustomDomains"

import { useProjectDetail } from "./_components/useProjectDetail"
import { ProjectBreadcrumb } from "./_components/ProjectBreadcrumb"
import { ProjectHeader } from "./_components/ProjectHeader"
import { ThrottleBanner } from "./_components/ThrottleBanner"
import { StatsCards } from "./_components/StatsCards"
import { BuildProgress } from "./_components/BuildProgress"
import { TabNavigation } from "./_components/TabNavigation"
import { DeploymentsTab } from "./_components/DeploymentsTab"
import { RuntimeLogsTab } from "./_components/RuntimeLogsTab"
import { ComputeTab } from "./_components/ComputeTab"
import { SettingsTab } from "./_components/SettingsTab"
import { DatabaseServiceView } from "./_components/DatabaseServiceView"
import { DeleteProjectDialog } from "./_components/DeleteProjectDialog"
import { ServiceSidebar, MobileSidebarTrigger } from "./_components/ServiceSidebar"
import type { Service } from "./_components/types"

const WEB_APP_TABS = [
    { key: "deployments", label: "Deployments" },
    { key: "domains", label: "Domains" },
    { key: "logs", label: "Logs" },
    { key: "compute", label: "Compute" },
    { key: "settings", label: "Settings" },
]

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const hook = useProjectDetail(id)
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

    // Loading skeleton — sidebar + detail shimmer
    if (hook.loading) {
        return (
            <div className="min-h-screen bg-white">
                <div className="px-4 sm:px-6 lg:px-8 py-6">
                    <div className="animate-pulse">
                        <div className="h-4 w-20 bg-zinc-200 rounded mb-6" />
                        <div className="h-8 w-48 bg-zinc-200 rounded mb-6" />
                    </div>
                </div>
                <div className="flex border-t border-zinc-200">
                    {/* Sidebar skeleton */}
                    <div className="hidden md:block w-[240px] shrink-0 border-r border-zinc-200 p-4">
                        <div className="animate-pulse space-y-3">
                            <div className="h-3 w-16 bg-zinc-200 rounded" />
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-10 bg-zinc-100 rounded-md" />
                            ))}
                        </div>
                    </div>
                    {/* Detail skeleton */}
                    <div className="flex-1 p-6">
                        <div className="animate-pulse">
                            <div className="h-10 w-64 bg-zinc-200 rounded mb-4" />
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-24 bg-zinc-50 rounded-none border border-zinc-200" />
                                ))}
                            </div>
                            <div className="h-64 bg-zinc-50 rounded-none border border-zinc-200" />
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    if (hook.error || !hook.data) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="h-8 w-8 text-red-500" />
                    </div>
                    <h2 className="text-xl font-semibold text-zinc-900 mb-2">Something went wrong</h2>
                    <p className="text-zinc-500 mb-6">{hook.error || "Project not found"}</p>
                    <Button onClick={hook.fetchProject} variant="outline" className="rounded-full">
                        Try Again
                    </Button>
                </div>
            </div>
        )
    }

    const { project, services } = hook.data

    if (services.length === 0) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="text-center">
                    <AlertCircle className="h-8 w-8 text-zinc-400 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-zinc-900 mb-2">No services</h2>
                    <p className="text-zinc-500 mb-6">This project has no services yet.</p>
                    <div className="flex items-center justify-center gap-3">
                        <Link href={`/new?project_id=${project.project_id}`}>
                            <Button variant="outline" className="rounded-full">
                                <Plus className="h-3.5 w-3.5 mr-1.5" />
                                Add Service
                            </Button>
                        </Link>
                        <DeleteProjectDialog
                            projectName={project.name}
                            deleting={hook.deleting}
                            open={hook.deleteDialogOpen}
                            onOpenChange={hook.setDeleteDialogOpen}
                            onDelete={hook.handleDeleteProject}
                        />
                    </div>
                </div>
            </div>
        )
    }

    const activeService = hook.activeService || services[0]
    const defaultServiceId = activeService.service_id

    const handleSelectService = (serviceId: string) => {
        hook.setActiveServiceId(serviceId)
        hook.resetServiceState()
        const svc = services.find(s => s.service_id === serviceId)
        if (svc?.service_type === "database") {
            hook.setActiveTab("configuration")
        } else {
            hook.setActiveTab("deployments")
        }
    }

    return (
        <>
            <div className="min-h-screen bg-white flex flex-col">
                {/* Top bar: breadcrumb + project name */}
                <div className="px-4 sm:px-6 lg:px-8 border-b border-zinc-200">
                    <ProjectBreadcrumb projectName={project.name} isDatabase={activeService.service_type === "database" && services.length === 1} />

                    <div className="flex items-center gap-2 pb-4">
                        <MobileSidebarTrigger onClick={() => setMobileSidebarOpen(true)} />
                        <h1 className="text-xl font-semibold text-zinc-900 tracking-tight truncate">{project.name}</h1>
                    </div>
                </div>

                {/* ── Sidebar + Detail ─────────────────────────── */}
                <div className="flex flex-1 min-h-0">
                    {/* Sidebar — hidden on mobile, shown on md+ */}
                    <ServiceSidebar
                        services={services}
                        activeServiceId={defaultServiceId}
                        projectId={project.project_id}
                        projectName={project.name}
                        onSelectService={handleSelectService}
                        mobileOpen={mobileSidebarOpen}
                        onMobileOpenChange={setMobileSidebarOpen}
                    />

                    {/* Detail panel */}
                    <main className="flex-1 min-w-0 overflow-y-auto">
                        <div className="px-4 sm:px-6 lg:px-8">
                            {activeService.service_type === "database" ? (
                                <DatabaseServiceView service={activeService} hook={hook} />
                            ) : (
                                <WebAppServiceView service={activeService} project={project} hook={hook} projectId={id} />
                            )}
                        </div>
                    </main>
                </div>
            </div>

            <UpgradeModal isOpen={hook.upgradeModalOpen} onClose={hook.closeUpgradeModal} />
        </>
    )
}

// ── Web App Service View ────────────────────────────────────────
function WebAppServiceView({
    service,
    project,
    hook,
    projectId,
}: {
    service: Service
    project: { project_id: string; name: string }
    hook: ReturnType<typeof useProjectDetail>
    projectId: string
}) {
    const deployments = service.deployments || []
    const isBuilding = !["LIVE", "FAILED"].includes(service.status)

    const activeCustomDomain = service.custom_domains?.find(d => d.is_active)
    const displayUrl = activeCustomDomain
        ? `https://${activeCustomDomain.domain}`
        : (service.custom_url || service.function_url || null)

    const projectCompat = {
        ...project,
        ...service,
        project_id: project.project_id,
    }

    return (
        <>
            <ProjectHeader
                project={projectCompat}
                isBuilding={isBuilding}
                redeploying={hook.redeploying}
                onRedeploy={hook.handleRedeploy}
            />

            {service.is_throttled && (
                <ThrottleBanner onUpgradeClick={hook.openUpgradeModal} />
            )}

            <StatsCards
                project={projectCompat}
                displayUrl={displayUrl}
                latestDeployment={deployments[0]}
                copied={hook.copied}
                onCopy={hook.copyToClipboard}
            />

            {isBuilding && <BuildProgress currentStatus={service.status} />}

            <TabNavigation
                tabs={WEB_APP_TABS}
                activeTab={hook.activeTab}
                onTabChange={(tab) => hook.setActiveTab(tab as "deployments" | "domains" | "logs" | "compute" | "settings")}
            />

            <div className="py-6">
                {hook.activeTab === "deployments" && (
                    <DeploymentsTab
                        project={projectCompat}
                        serviceId={service.service_id}
                        deployments={deployments}
                        expandedDeployId={hook.expandedDeployId}
                        onToggleExpand={hook.setExpandedDeployId}
                        orgId={hook.orgId!}
                        onDeployComplete={hook.fetchProject}
                    />
                )}

                {hook.activeTab === "domains" && (
                    <CustomDomains
                        projectId={service.service_id}
                        orgId={hook.orgId ?? null}
                        subdomain={service.subdomain ?? null}
                        customDomains={service.custom_domains}
                        onRefetch={hook.fetchProject}
                    />
                )}

                {hook.activeTab === "logs" && (
                    <RuntimeLogsTab
                        logs={hook.logs}
                        logsLoading={hook.logsLoading}
                        onRefresh={hook.fetchLogs}
                    />
                )}

                {hook.activeTab === "compute" && (
                    <ComputeTab
                        project={projectCompat}
                        editingCompute={hook.editingCompute}
                        memoryValue={hook.memoryValue}
                        timeoutValue={hook.timeoutValue}
                        ephemeralStorageValue={hook.ephemeralStorageValue}
                        savingCompute={hook.savingCompute}
                        currentPlan={hook.currentPlan ?? null}
                        onMemoryChange={hook.setMemoryValue}
                        onTimeoutChange={hook.setTimeoutValue}
                        onEphemeralStorageChange={hook.setEphemeralStorageValue}
                        onStartEditing={hook.startEditingCompute}
                        onSave={hook.saveCompute}
                        onCancel={() => hook.setEditingCompute(false)}
                        onUpgradeClick={hook.openUpgradeModal}
                    />
                )}

                {hook.activeTab === "settings" && (
                    <SettingsTab
                        project={projectCompat}
                        editingStartCommand={hook.editingStartCommand}
                        startCommandValue={hook.startCommandValue}
                        savingStartCommand={hook.savingStartCommand}
                        onStartCommandChange={hook.setStartCommandValue}
                        onStartEditStartCommand={hook.startEditingStartCommand}
                        onSaveStartCommand={hook.saveStartCommand}
                        onCancelStartCommand={() => hook.setEditingStartCommand(false)}
                        editingEnvVars={hook.editingEnvVars}
                        envVarsList={hook.envVarsList}
                        savingEnvVars={hook.savingEnvVars}
                        onEnvVarsChange={hook.setEnvVarsList}
                        onStartEditEnvVars={hook.startEditingEnvVars}
                        onSaveEnvVars={hook.saveEnvVars}
                        onCancelEnvVars={() => hook.setEditingEnvVars(false)}
                        deleting={hook.deleting}
                        deleteDialogOpen={hook.deleteDialogOpen}
                        onDeleteDialogOpenChange={hook.setDeleteDialogOpen}
                        onDelete={() => hook.handleDeleteService(service.service_id)}
                    />
                )}
            </div>
        </>
    )
}

