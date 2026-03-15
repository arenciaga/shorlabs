/**
 * EC2 Compute Options - Single Source of Truth
 *
 * All t4g instances have 2 vCPUs (ARM64 Graviton2)
 * Instance type is determined by memory allocation
 *
 * Note: instanceType, label, and price are for internal/backend use only
 * Users only see vCPU and memory in the UI
 *
 * Web Services require Plus plan minimum. Hobby users cannot deploy web services.
 */

export type PlanTier = "hobby" | "plus" | "pro"

export interface ComputeOption {
    cpu: number
    memory: number
    instanceType: string  // Internal use only
    label: string         // Internal use only
    price: string         // Internal use only
    minPlan: PlanTier
    badge?: string        // Shown on locked options
}

export const EC2_COMPUTE_OPTIONS: ComputeOption[] = [
    { cpu: 2048, memory: 1024, instanceType: "t4g.micro", label: "t4g.micro", price: "$6.13/month", minPlan: "plus" },
    { cpu: 2048, memory: 2048, instanceType: "t4g.small", label: "t4g.small", price: "$12.25/month", minPlan: "plus" },
    { cpu: 2048, memory: 4096, instanceType: "t4g.medium", label: "t4g.medium", price: "$24.55/month", minPlan: "pro", badge: "Pro" },
    { cpu: 2048, memory: 8192, instanceType: "t4g.large", label: "t4g.large", price: "$49.06/month", minPlan: "pro", badge: "Pro" },
]

export const DEFAULT_COMPUTE_INDEX = 0 // t4g.micro (2 vCPU / 1 GB)

const PLAN_ORDER: Record<PlanTier, number> = {
    hobby: 0,
    plus: 1,
    pro: 2,
}

export const hasAccessToPlan = (current: PlanTier, required: PlanTier) =>
    PLAN_ORDER[current] >= PLAN_ORDER[required]
