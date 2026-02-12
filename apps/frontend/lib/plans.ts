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
    features: PlanFeature[]
}

export const PLANS: Plan[] = [
    {
        id: "hobby",
        name: "Hobby",
        description: "Perfect for personal projects and testing.",
        price: "$0",
        period: "/ month",
        features: [
            { label: "Unlimited Projects", icon: FolderOpen },
            { label: "5K Requests/Month", icon: Globe },
            { label: "2.5K Compute (GB-s)/Month", icon: Zap },
            { label: "1 GB Memory", icon: Cpu },
            { label: "Up to 30s Timeout", icon: Clock },
            { label: "512 MB Temp Disk", icon: HardDrive },
        ],
    },
    {
        id: "pro",
        name: "Pro",
        description: "Built for production workloads and commercial applications.",
        price: "$20",
        period: "/ month",
        highlighted: true,
        features: [
            { label: "Unlimited Projects", icon: FolderOpen },
            { label: "$20 Included Usage/Month", icon: DollarSign },
            { label: "$0.60 / 1M Requests", icon: Globe },
            { label: "$0.035 / 1K Compute (GB-s)", icon: Zap },
            { label: "Up to 4 GB Memory", icon: Cpu },
            { label: "Up to 300s Timeout", icon: Clock },
            { label: "Up to 2 GB Temp Disk", icon: HardDrive },
        ],
    },
]
