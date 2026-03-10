"use client"

import { use, useState, useEffect, useRef } from "react"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { UpgradeModal } from "@/components/upgrade-modal"
import { useIsMobile } from "@/hooks/use-mobile"
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet"

import { useProjectDetail } from "./_components/useProjectDetail"
import { DatabaseServiceView } from "./_components/DatabaseServiceView"
import { WebAppServiceView } from "./_components/WebAppServiceView"
import { DeleteProjectDialog } from "./_components/DeleteProjectDialog"
import { ProjectCanvas } from "./_components/canvas/ProjectCanvas"
import { MobileServiceGrid } from "./_components/canvas/MobileServiceGrid"

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const hook = useProjectDetail(id)
    const isMobile = useIsMobile()
    const [detailOpen, setDetailOpen] = useState(false)

    // Close the sheet when a service is deleted (service count drops)
    const serviceCount = hook.data?.services?.length ?? 0
    const prevServiceCount = useRef(serviceCount)
    useEffect(() => {
        if (serviceCount < prevServiceCount.current && prevServiceCount.current > 0) {
            setDetailOpen(false)
        }
        prevServiceCount.current = serviceCount
    }, [serviceCount])

    // Loading skeleton
    if (hook.loading) {
        return (
            <div className="h-screen bg-white flex flex-col">
                {/* Breadcrumb skeleton */}
                <div className="px-4 sm:px-6 lg:px-8 border-b border-zinc-200">
                    <div className="animate-pulse pt-5 pb-4">
                        <div className="h-4 w-32 bg-zinc-100" />
                    </div>
                </div>

                {/* Canvas skeleton — fake dot grid + ghost cards */}
                <div className="flex-1 relative overflow-hidden" style={{ backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.08) 1px, transparent 1px)", backgroundSize: "20px 20px" }}>
                    <div className="animate-pulse flex flex-wrap gap-[60px] p-[60px]">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="w-[240px] bg-white border border-zinc-200 shadow-sm">
                                <div className="h-1 w-full bg-zinc-200" />
                                <div className="p-4 space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 bg-zinc-100" />
                                        <div className="flex-1 space-y-1.5">
                                            <div className="h-4 w-24 bg-zinc-200" />
                                            <div className="h-3 w-14 bg-zinc-100" />
                                        </div>
                                    </div>
                                    <div className="h-3 w-16 bg-zinc-100" />
                                    <div className="border-t border-zinc-100 pt-2.5">
                                        <div className="h-3 w-32 bg-zinc-100" />
                                    </div>
                                </div>
                            </div>
                        ))}
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

    const activeService = services.length > 0
        ? (hook.activeService || services[0])
        : null

    const handleCanvasSelect = (serviceId: string) => {
        hook.setActiveServiceId(serviceId)
        hook.resetServiceState()
        const svc = services.find(s => s.service_id === serviceId)
        if (svc?.service_type === "database") {
            hook.setActiveTab("configuration")
        } else {
            hook.setActiveTab("deployments")
        }
        setDetailOpen(true)
    }

    return (
        <>
            <div className="h-screen bg-white flex flex-col overflow-hidden">
                {/* Canvas — always rendered */}
                {isMobile ? (
                    <MobileServiceGrid
                        services={services}
                        projectId={project.project_id}
                        onSelectService={handleCanvasSelect}
                    />
                ) : (
                    <div className="flex-1 min-h-0 relative">
                        <ProjectCanvas
                            services={services}
                            projectId={project.project_id}
                            onSelectService={handleCanvasSelect}
                        />
                        {services.length === 0 && (
                            <div className="absolute bottom-4 right-4 z-10">
                                <DeleteProjectDialog
                                    projectName={project.name}
                                    deleting={hook.deleting}
                                    open={hook.deleteDialogOpen}
                                    onOpenChange={hook.setDeleteDialogOpen}
                                    onDelete={hook.handleDeleteProject}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Detail slide-in from right */}
            {activeService && (
                <Sheet open={detailOpen} onOpenChange={(open) => !open && setDetailOpen(false)}>
                    <SheetContent
                        side="right"
                        className="w-full gap-0 border-l border-zinc-200 bg-white p-0 md:!w-[70%] md:!max-w-none overflow-y-auto"
                    >
                        <SheetHeader className="sr-only">
                            <SheetTitle>{activeService.name || "Service"}</SheetTitle>
                            <SheetDescription>Service details</SheetDescription>
                        </SheetHeader>
                        <div className="px-4 sm:px-6 lg:px-8 pt-6 pb-12">
                            {activeService.service_type === "database" ? (
                                <DatabaseServiceView service={activeService} hook={hook} />
                            ) : (
                                <WebAppServiceView service={activeService} project={project} hook={hook} projectId={id} />
                            )}
                        </div>
                    </SheetContent>
                </Sheet>
            )}

            <UpgradeModal isOpen={hook.upgradeModalOpen} onClose={hook.closeUpgradeModal} />
        </>
    )
}
