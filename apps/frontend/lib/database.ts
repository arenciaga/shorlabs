export const ACU_OPTIONS = [
    { value: 1, label: "Small", description: "2 GB RAM", minPlan: "hobby" },
    { value: 2, label: "Medium", description: "4 GB RAM", minPlan: "plus" },
    { value: 4, label: "Large", description: "8 GB RAM", minPlan: "pro" },
] as const

const PLAN_RANK: Record<string, number> = { hobby: 0, plus: 1, pro: 2 }

export function isOptionLocked(
    optionMinPlan: string,
    currentPlan: string | undefined,
): { locked: boolean; requiredPlan: string } {
    const userRank = PLAN_RANK[currentPlan ?? "hobby"] ?? 0
    const requiredRank = PLAN_RANK[optionMinPlan] ?? 0
    return {
        locked: userRank < requiredRank,
        requiredPlan: optionMinPlan.charAt(0).toUpperCase() + optionMinPlan.slice(1),
    }
}
