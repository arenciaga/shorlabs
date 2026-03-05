"use client"

import { use } from "react"
import { AlertCircle, Loader2 } from "lucide-react"
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
import { DatabaseProjectView } from "./_components/DatabaseProjectView"

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

    // Loading skeleton
    if (hook.loading) {
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

    // ── Database project branch ──────────────────────────────────
    if (hook.isDatabaseProject) {
        return <DatabaseProjectView hook={hook} />
    }

    // ── Web-app project ──────────────────────────────────────────
    const { project, deployments } = hook.data
    const isBuilding = !["LIVE", "FAILED"].includes(project.status)

    // Prefer active custom domain over the default shorlabs URL
    const activeCustomDomain = hook.data.custom_domains?.find(d => d.is_active)
    const displayUrl = activeCustomDomain
        ? `https://${activeCustomDomain.domain}`
        : (project.custom_url || project.function_url)

    return (
        <>
            <div className="min-h-screen bg-white">
                <div className="px-4 sm:px-6 lg:px-8">
                    <ProjectBreadcrumb projectName={project.name} />

                    <ProjectHeader
                        project={project}
                        isBuilding={isBuilding}
                        redeploying={hook.redeploying}
                        onRedeploy={hook.handleRedeploy}
                    />

                    {project.is_throttled && (
                        <ThrottleBanner onUpgradeClick={hook.openUpgradeModal} />
                    )}

                    <StatsCards
                        project={project}
                        displayUrl={displayUrl}
                        latestDeployment={deployments[0]}
                        copied={hook.copied}
                        onCopy={hook.copyToClipboard}
                    />

                    {isBuilding && <BuildProgress currentStatus={project.status} />}

                    <TabNavigation
                        tabs={WEB_APP_TABS}
                        activeTab={hook.activeTab}
                        onTabChange={(tab) => hook.setActiveTab(tab as "deployments" | "domains" | "logs" | "compute" | "settings")}
                    />

                    <div className="py-6">
                        {hook.activeTab === "deployments" && (
                            <DeploymentsTab
                                project={project}
                                deployments={deployments}
                                expandedDeployId={hook.expandedDeployId}
                                onToggleExpand={hook.setExpandedDeployId}
                                orgId={hook.orgId!}
                                onDeployComplete={hook.fetchProject}
                            />
                        )}

                        {hook.activeTab === "domains" && (
                            <CustomDomains
                                projectId={id}
                                orgId={hook.orgId ?? null}
                                subdomain={project.subdomain ?? null}
                                customDomains={hook.data?.custom_domains}
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
                                project={project}
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
                                project={project}
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
                                onDelete={hook.handleDeleteProject}
                            />
                        )}
                    </div>
                </div>
            </div>

            <UpgradeModal isOpen={hook.upgradeModalOpen} onClose={hook.closeUpgradeModal} />
        </>
    )
}
