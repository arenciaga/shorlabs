import { Database, Loader2, Zap } from "lucide-react"
import { UpgradeModal } from "@/components/upgrade-modal"
import { DatabaseExplorer } from "@/components/DatabaseExplorer"
import { ProjectBreadcrumb } from "./ProjectBreadcrumb"
import { TabNavigation } from "./TabNavigation"
import { DatabaseConnectionDetails } from "./DatabaseConnectionDetails"
import { DatabaseConfigTab } from "./DatabaseConfigTab"
import { DatabaseSecurityTab } from "./DatabaseSecurityTab"
import { DeleteProjectDialog } from "./DeleteProjectDialog"
import { STATUS_CONFIG } from "./constants"
import type { UseProjectDetailReturn } from "./useProjectDetail"

const DB_TABS = [
    { key: "configuration", label: "Configuration" },
    { key: "explorer", label: "Explorer" },
    { key: "security", label: "Security" },
    { key: "settings", label: "Settings" },
]

interface DatabaseProjectViewProps {
    hook: UseProjectDetailReturn
}

export function DatabaseProjectView({ hook }: DatabaseProjectViewProps) {
    const project = hook.data!.project
    const service = hook.data!.services[0]
    if (!service) return null

    const statusConfig = STATUS_CONFIG[service.status] || STATUS_CONFIG.PENDING
    const isBuilding = !["LIVE", "FAILED"].includes(service.status)

    // Build a compat object for child components that still expect the old project shape
    const serviceCompat = {
        ...project,
        ...service,
        project_id: project.project_id,
    }

    return (
        <>
            <div className="min-h-screen bg-white">
                <div className="px-4 sm:px-6 lg:px-8">
                    {/* Breadcrumb */}
                    <ProjectBreadcrumb projectName={project.name} isDatabase />

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
                    {service.status === "DELETING" && (
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
                    {service.status !== "DELETING" && (
                        <DatabaseConnectionDetails
                            project={serviceCompat}
                            isBuilding={isBuilding}
                            dbConnection={hook.dbConnection}
                            showPassword={hook.showPassword}
                            loadingConnection={hook.loadingConnection}
                            copiedField={hook.copiedField}
                            onCopyField={hook.copyFieldToClipboard}
                            onTogglePassword={hook.handleShowPassword}
                        />
                    )}

                    {/* Provisioning Progress — not shown during deletion */}
                    {isBuilding && service.status !== "DELETING" && (
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
                    {service.status !== "DELETING" && (<>
                        <TabNavigation
                            tabs={DB_TABS}
                            activeTab={hook.dbActiveTab}
                            onTabChange={(tab) => hook.setActiveTab(tab as "configuration" | "explorer" | "security" | "settings")}
                        />

                        <div className="py-6">
                            {/* Configuration Tab */}
                            {hook.dbActiveTab === "configuration" && (
                                <DatabaseConfigTab
                                    service={service}
                                    projectId={project.project_id}
                                    onRefresh={hook.fetchProject}
                                />
                            )}

                            {/* Explorer Tab */}
                            {hook.dbActiveTab === "explorer" && (
                                <DatabaseExplorer
                                    projectId={project.project_id}
                                    orgId={hook.orgId ?? null}
                                    projectStatus={service.status}
                                />
                            )}

                            {/* Security Tab */}
                            {hook.dbActiveTab === "security" && (
                                <DatabaseSecurityTab
                                    isProvisioning={!hook.isDbLive}
                                    securityRules={hook.securityRules}
                                    loadingRules={hook.loadingRules}
                                    isOpenAccess={hook.isOpenAccess}
                                    togglingAccess={hook.togglingAccess}
                                    userIpRules={hook.userIpRules}
                                    userIp={hook.userIp}
                                    newIpCidr={hook.newIpCidr}
                                    newIpLabel={hook.newIpLabel}
                                    addingRule={hook.addingRule}
                                    deletingRuleId={hook.deletingRuleId}
                                    onRefresh={hook.loadSecurityRules}
                                    onToggleAccessMode={hook.handleToggleAccessMode}
                                    onAddIp={hook.handleAddIp}
                                    onDeleteRule={hook.handleDeleteRule}
                                    onNewIpCidrChange={hook.setNewIpCidr}
                                    onNewIpLabelChange={hook.setNewIpLabel}
                                />
                            )}

                            {/* Settings Tab */}
                            {hook.dbActiveTab === "settings" && (
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
                                                <DeleteProjectDialog
                                                    projectName={project.name}
                                                    deleting={hook.deleting}
                                                    open={hook.deleteDialogOpen}
                                                    onOpenChange={hook.setDeleteDialogOpen}
                                                    onDelete={hook.handleDeleteProject}
                                                    entityLabel="Delete Database"
                                                    description={<>This will permanently delete <strong>{project.name}</strong> and all its data.</>}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>)}
                </div>
            </div>

            <UpgradeModal isOpen={hook.upgradeModalOpen} onClose={hook.closeUpgradeModal} />
        </>
    )
}
