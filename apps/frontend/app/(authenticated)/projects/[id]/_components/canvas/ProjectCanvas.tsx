"use client"

import {
    ReactFlow,
    ReactFlowProvider,
    Background,
    BackgroundVariant,
    useReactFlow,
    type NodeTypes,
    type Node,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import "./canvas-styles.css"
import { Plus, ZoomIn, ZoomOut } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { ServiceNode } from "./ServiceNode"
import { useCanvasLayout } from "./useCanvasLayout"
import type { Service } from "../types"

const nodeTypes: NodeTypes = {
    serviceNode: ServiceNode,
}

interface ProjectCanvasProps {
    services: Service[]
    projectId: string
    onSelectService: (serviceId: string) => void
    /** Optional extra content rendered below the Add Service button (top-right) */
    topRightExtra?: React.ReactNode
    isDrawerOpen?: boolean
}

function ZoomControls() {
    const { zoomIn, zoomOut } = useReactFlow()

    return (
        <div className="absolute top-4 left-4 z-10 flex flex-col">
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="outline"
                        size="icon"
                        className="rounded-none rounded-t-none h-8 w-8 border-b-0"
                        onClick={() => zoomIn({ duration: 200 })}
                    >
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Zoom in</TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="outline"
                        size="icon"
                        className="rounded-none rounded-b-none h-8 w-8"
                        onClick={() => zoomOut({ duration: 200 })}
                    >
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Zoom out</TooltipContent>
            </Tooltip>
        </div>
    )
}

function CanvasInner({ services, projectId, onSelectService, topRightExtra, isDrawerOpen }: ProjectCanvasProps) {
    const { nodes, edges } = useCanvasLayout(services)

    const handleNodeClick = (_event: React.MouseEvent, node: Node) => {
        onSelectService(node.id)
    }

    return (
        <div className="relative w-full h-full">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodeClick={handleNodeClick}
                fitView
                fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                panOnScroll
                zoomOnScroll
                minZoom={0.3}
                maxZoom={1.2}
                proOptions={{ hideAttribution: true }}
            >
                <Background variant={BackgroundVariant.Dots} gap={20} size={2.5} color="rgba(0,0,0,0.15)" />
            </ReactFlow>

            <ZoomControls />

            {/* Top-right actions (shifts when drawer is open to stay visible) */}
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                <Link href={`/new?project_id=${projectId}`}>
                    <Button
                        variant="outline"
                        className="rounded-none border-dashed w-full bg-white shadow-sm"
                    >
                        <Plus className="h-4 w-4 mr-1.5" />
                        Add Service
                    </Button>
                </Link>
                {topRightExtra}
            </div>
        </div>
    )
}

export function ProjectCanvas(props: ProjectCanvasProps) {
    return (
        <ReactFlowProvider>
            <CanvasInner {...props} />
        </ReactFlowProvider>
    )
}
