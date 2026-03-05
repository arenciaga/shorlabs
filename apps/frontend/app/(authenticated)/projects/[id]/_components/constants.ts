export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export const STATUS_CONFIG: Record<string, { dot: string; label: string; color: string; bgGlow: string }> = {
    PENDING: { dot: "bg-zinc-400", label: "Queued", color: "text-zinc-600", bgGlow: "" },
    CLONING: { dot: "bg-blue-500", label: "Cloning", color: "text-blue-600", bgGlow: "shadow-blue-500/20" },
    PREPARING: { dot: "bg-blue-500", label: "Preparing", color: "text-blue-600", bgGlow: "shadow-blue-500/20" },
    UPLOADING: { dot: "bg-blue-600", label: "Uploading", color: "text-blue-600", bgGlow: "shadow-blue-500/20" },
    BUILDING: { dot: "bg-blue-900", label: "Building", color: "text-blue-900", bgGlow: "shadow-blue-900/20" },
    DEPLOYING: { dot: "bg-blue-900", label: "Deploying", color: "text-blue-900", bgGlow: "shadow-blue-900/20" },
    PROVISIONING: { dot: "bg-blue-500", label: "Provisioning", color: "text-blue-600", bgGlow: "shadow-blue-500/20" },
    LIVE: { dot: "bg-emerald-500", label: "Live", color: "text-emerald-600", bgGlow: "shadow-emerald-500/30" },
    FAILED: { dot: "bg-red-500", label: "Failed", color: "text-red-600", bgGlow: "shadow-red-500/20" },
    DELETING: { dot: "bg-red-400", label: "Deleting", color: "text-red-500", bgGlow: "shadow-red-400/20" },
}

// Include PENDING as the first step so users can see that a redeploy has been queued
export const BUILD_STEPS = ["PENDING", "CLONING", "PREPARING", "UPLOADING", "BUILDING", "DEPLOYING"]
