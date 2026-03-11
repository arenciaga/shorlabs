export const ACU_OPTIONS = [
    { value: 0.25, label: "Hobby", description: "0.5 GB RAM", minPlan: "hobby" },
    { value: 0.5, label: "Starter", description: "1 GB RAM", minPlan: "plus" },
    { value: 1, label: "Small", description: "2 GB RAM", minPlan: "plus" },
    { value: 2, label: "Medium", description: "4 GB RAM", minPlan: "pro" },
    { value: 4, label: "Large", description: "8 GB RAM", minPlan: "pro" },
] as const
