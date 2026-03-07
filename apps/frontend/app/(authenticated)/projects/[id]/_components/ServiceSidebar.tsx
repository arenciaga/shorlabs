"use client"

import { Globe, Database, Plus, Settings, Menu, Cog } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import { STATUS_CONFIG } from "./constants"
import type { Service } from "./types"

interface ServiceSidebarProps {
    services: Service[]
    activeServiceId: string
    projectId: string
    projectName: string
    onSelectService: (serviceId: string) => void
    mobileOpen: boolean
    onMobileOpenChange: (open: boolean) => void
}

function ServiceIcon({ type, className }: { type: string; className?: string }) {
    if (type === "database") return <Database className={className} />
    return <Globe className={className} />
}

function ServiceList({
    services,
    activeServiceId,
    projectId,
    onSelectService,
    onMobileClose,
}: {
    services: Service[]
    activeServiceId: string
    projectId: string
    onSelectService: (serviceId: string) => void
    onMobileClose?: () => void
}) {
    return (
        <div className="flex flex-col h-full">
            {/* Service list */}
            <div className="flex-1 overflow-y-auto py-2 px-2">
                <div className="px-2 mb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                        Services
                    </span>
                </div>
                <div className="space-y-0.5">
                    {services.map((svc) => {
                        const isActive = svc.service_id === activeServiceId
                        const statusConfig = STATUS_CONFIG[svc.status] || STATUS_CONFIG.PENDING
                        const isDb = svc.service_type === "database"
                        const isBuilding = !["LIVE", "FAILED"].includes(svc.status)

                        return (
                            <button
                                key={svc.service_id}
                                onClick={() => {
                                    onSelectService(svc.service_id)
                                    onMobileClose?.()
                                }}
                                className={`
                                    w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors
                                    ${isActive
                                        ? "bg-zinc-100 text-zinc-900"
                                        : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                    }
                                `}
                            >
                                <ServiceIcon
                                    type={svc.service_type}
                                    className={`h-4 w-4 shrink-0 ${isActive ? "text-zinc-700" : "text-zinc-400"}`}
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">
                                        {svc.name || (isDb ? "Database" : "Web App")}
                                    </div>
                                    <div className="text-[11px] text-zinc-400 capitalize">
                                        {isDb ? "PostgreSQL" : "Web App"}
                                    </div>
                                </div>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span
                                            className={`w-2 h-2 rounded-full shrink-0 ${statusConfig.dot} ${isBuilding ? "animate-pulse" : ""}`}
                                        />
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="text-xs">
                                        {statusConfig.label}
                                    </TooltipContent>
                                </Tooltip>
                            </button>
                        )
                    })}
                </div>

                {/* Add Service */}
                <div className="mt-3 px-0.5">
                    <Link href={`/new?project_id=${projectId}`}>
                        <button className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 transition-colors border border-dashed border-zinc-200">
                            <Plus className="h-4 w-4 shrink-0" />
                            <span className="text-sm">Add Service</span>
                        </button>
                    </Link>
                </div>
            </div>

            <Separator className="mx-0" />

            {/* Project-level footer */}
            <div className="p-2">
                <div className="px-2 mb-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                        Project
                    </span>
                </div>
                <button className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 transition-colors">
                    <Cog className="h-4 w-4 shrink-0" />
                    <span className="text-sm">Settings</span>
                </button>
            </div>
        </div>
    )
}

export function ServiceSidebar({
    services,
    activeServiceId,
    projectId,
    projectName,
    onSelectService,
    mobileOpen,
    onMobileOpenChange,
}: ServiceSidebarProps) {
    const isMobile = useIsMobile()

    // Mobile: render as Sheet
    if (isMobile) {
        return (
            <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
                <SheetContent side="left" className="w-[260px] p-0">
                    <SheetHeader className="px-4 pt-4 pb-2">
                        <SheetTitle className="text-sm font-semibold text-zinc-900 truncate">{projectName}</SheetTitle>
                        <SheetDescription className="sr-only">Service navigation</SheetDescription>
                    </SheetHeader>
                    <ServiceList
                        services={services}
                        activeServiceId={activeServiceId}
                        projectId={projectId}
                        onSelectService={onSelectService}
                        onMobileClose={() => onMobileOpenChange(false)}
                    />
                </SheetContent>
            </Sheet>
        )
    }

    // Desktop: render as fixed sidebar
    return (
        <aside className="w-[240px] shrink-0 border-r border-zinc-200 bg-zinc-50/50 flex flex-col">
            <ServiceList
                services={services}
                activeServiceId={activeServiceId}
                projectId={projectId}
                onSelectService={onSelectService}
            />
        </aside>
    )
}

export function MobileSidebarTrigger({ onClick }: { onClick: () => void }) {
    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={onClick}
            className="md:hidden h-8 w-8 shrink-0"
        >
            <Menu className="h-4 w-4" />
            <span className="sr-only">Open services</span>
        </Button>
    )
}
