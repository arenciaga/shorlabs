"use client"

import { CustomDomains } from "@/components/CustomDomains"
import { ProjectHeader } from "./ProjectHeader"
import { ThrottleBanner } from "./ThrottleBanner"
import { StatsCards } from "./StatsCards"
import { BuildProgress } from "./BuildProgress"
import { TabNavigation } from "./TabNavigation"
import { DeploymentsTab } from "./DeploymentsTab"
import { RuntimeLogsTab } from "./RuntimeLogsTab"
import { ComputeTab } from "./ComputeTab"
import { SettingsTab } from "./SettingsTab"
import type { Service } from "./types"
import type { useProjectDetail } from "./useProjectDetail"

const WEB_APP_TABS = [
    { key: "deployments", label: "Deployments" },
    { key: "domains", label: "Domains" },
    { key: "logs", label: "Logs" },
    { key: "compute", label: "Compute" },
    { key: "settings", label: "Settings" },
]

const WEB_SERVICE_TABS = [
    { key: "deployments", label: "Deployments" },
    { key: "logs", label: "Logs" },
    { key: "settings", label: "Settings" },
]

export function WebAppServiceView({
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
        : (service.custom_url || service.function_url || service.service_url || null)

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
                tabs={service.service_type === "web-service" ? WEB_SERVICE_TABS : WEB_APP_TABS}
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
