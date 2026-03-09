import { useMemo } from "react"
import type { Node, Edge } from "@xyflow/react"
import type { Service } from "../types"
import type { ServiceNodeData } from "./ServiceNode"

const NODE_WIDTH = 240
const NODE_HEIGHT = 160
const GAP_X = 60
const GAP_Y = 50
const COLS = 3

export function useCanvasLayout(
    services: Service[],
): { nodes: Node[]; edges: Edge[] } {
    return useMemo(() => {
        const nodes: Node[] = services.map((service, index) => {
            const col = index % COLS
            const row = Math.floor(index / COLS)
            return {
                id: service.service_id,
                type: "serviceNode",
                position: {
                    x: col * (NODE_WIDTH + GAP_X) + GAP_X,
                    y: row * (NODE_HEIGHT + GAP_Y) + GAP_Y,
                },
                data: { service } satisfies ServiceNodeData,
                draggable: false,
            }
        })

        const edges: Edge[] = []

        return { nodes, edges }
    }, [services])
}
