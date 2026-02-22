import { Clock, Cpu, DollarSign, FolderOpen, Globe, HardDrive, type LucideIcon, Zap } from 'lucide-react'

export interface PlanFeature {
    label: string
    icon: LucideIcon
}

export interface Plan {
    id: string
    name: string
    description: string
    price: string
    period: string
    highlighted?: boolean
    trialLabel?: string
    features: PlanFeature[]
}

export const USAGE_PRICING = {
    requests: "$0.60 / 1M Requests",
    compute: "$0.035 / 1K Compute (GB-s)",
} as const

export const PLANS: Plan[] = [
    {
        id: "hobby",
        name: "Hobby",
        description: "Perfect for personal projects and testing.",
        price: "$0",
        period: "/ month",
        features: [
            { label: "3K Requests/Month", icon: Globe },
            { label: "1.2K Compute (GB-s)/Month", icon: Zap },
            { label: "1 GB Memory", icon: Cpu },
            { label: "Up to 30s Timeout", icon: Clock },
            { label: "1 GB Temporary storage", icon: HardDrive },
        ],
    },
    {
        id: "plus",
        name: "Plus",
        description: "Great for growing projects that need more scale.",
        price: "$5",
        period: "/ month",
        trialLabel: "30 day free trial",
        features: [
            { label: "$5 Included Usage/Month", icon: DollarSign },
            { label: USAGE_PRICING.requests, icon: Globe },
            { label: USAGE_PRICING.compute, icon: Zap },
            { label: "Up to 4 GB Memory", icon: Cpu },
            { label: "Up to 60s Timeout", icon: Clock },
            { label: "Up to 2 GB Temporary storage", icon: HardDrive },
        ],
    },
    {
        id: "pro",
        name: "Pro",
        description: "Built for production workloads and commercial applications.",
        price: "$20",
        period: "/ month",
        highlighted: true,
        trialLabel: "30 day free trial",
        features: [
            { label: "$20 Included Usage/Month", icon: DollarSign },
            { label: USAGE_PRICING.requests, icon: Globe },
            { label: USAGE_PRICING.compute, icon: Zap },
            { label: "Up to 8 GB Memory", icon: Cpu },
            { label: "Up to 300s Timeout", icon: Clock },
            { label: "Up to 8 GB Temporary storage", icon: HardDrive },
        ],
    },
]
