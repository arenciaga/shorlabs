import { Clock, Cpu, FolderOpen, Globe, HardDrive, type LucideIcon, Zap } from 'lucide-react'

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
            { label: "50K Requests/Month", icon: Globe },
            { label: "20K Compute/Month", icon: Zap },
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
            { label: "1M Requests/Month", icon: Globe },
            { label: "400K Compute/Month", icon: Zap },
            { label: "Up to 4 GB Memory", icon: Cpu },
            { label: "Up to 300s Timeout", icon: Clock },
            { label: "2 GB Temp Disk", icon: HardDrive },
        ],
    },
]
