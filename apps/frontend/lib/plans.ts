import { Clock, Cpu, Database, DollarSign, Flame, FolderOpen, Globe, Hammer, HardDrive, type LucideIcon, Server, Zap } from 'lucide-react'

export interface PlanFeature {
    label: string
    icon: LucideIcon
}

export interface FeatureGroup {
    category: string
    features: PlanFeature[]
}

export interface Plan {
    id: string
    name: string
    description: string
    price: string
    period: string
    highlighted?: boolean
    trialLabel?: string
    featureGroups: FeatureGroup[]
}

export const USAGE_PRICING = {
    requests: "$0.60 / 1M Requests",
    compute: "$0.035 / 1K Compute (GB-s)",
    vcpuTime: "$0.000002 per vCPU / sec",
    memoryTime: "$0.00000433 per GB / sec",
} as const

export const PLANS: Plan[] = [
    {
        id: "hobby",
        name: "Hobby",
        description: "Perfect for personal projects and testing.",
        price: "$0",
        period: "/ month",
        featureGroups: [
            {
                category: "Web Apps",
                features: [
                    { label: "3K Requests/Month", icon: Globe },
                    { label: "1.2K Compute (GB-s)/Month", icon: Zap },
                    { label: "1 GB Memory", icon: Cpu },
                    { label: "Up to 30s Timeout", icon: Clock },
                    { label: "1 GB Temporary storage", icon: HardDrive },
                    { label: "Standard Builds", icon: Hammer },
                ],
            },
        ],
    },
    {
        id: "plus",
        name: "Plus",
        description: "Great for growing projects that need more scale.",
        price: "$5",
        period: "/ month",
        trialLabel: "7 day free trial",
        featureGroups: [
            {
                category: "Included",
                features: [
                    { label: "$5 Included Usage/Month", icon: DollarSign },
                ],
            },
            {
                category: "Web Apps",
                features: [
                    { label: USAGE_PRICING.requests, icon: Globe },
                    { label: USAGE_PRICING.compute, icon: Zap },
                    { label: "Up to 4 GB Memory", icon: Cpu },
                    { label: "Up to 60s Timeout", icon: Clock },
                    { label: "Up to 2 GB Temporary storage", icon: HardDrive },
                ],
            },
            {
                category: "Web Services",
                features: [
                    { label: USAGE_PRICING.vcpuTime, icon: Cpu },
                    { label: USAGE_PRICING.memoryTime, icon: HardDrive },
                ],
            },
            {
                category: "All Services",
                features: [
                    { label: "Faster Builds", icon: Hammer },
                    { label: "Zero Cold Starts", icon: Flame },
                ],
            },
        ],
    },
    {
        id: "pro",
        name: "Pro",
        description: "Built for production workloads and commercial applications.",
        price: "$20",
        period: "/ month",
        highlighted: false,
        featureGroups: [
            {
                category: "Included",
                features: [
                    { label: "$20 Included Usage/Month", icon: DollarSign },
                ],
            },
            {
                category: "Web Apps",
                features: [
                    { label: USAGE_PRICING.requests, icon: Globe },
                    { label: USAGE_PRICING.compute, icon: Zap },
                    { label: "Up to 8 GB Memory", icon: Cpu },
                    { label: "Up to 300s Timeout", icon: Clock },
                    { label: "Up to 8 GB Temporary storage", icon: HardDrive },
                ],
            },
            {
                category: "Web Services",
                features: [
                    { label: USAGE_PRICING.vcpuTime, icon: Cpu },
                    { label: USAGE_PRICING.memoryTime, icon: HardDrive },
                ],
            },
            {
                category: "All Services",
                features: [
                    { label: "Faster Builds", icon: Hammer },
                    { label: "Zero Cold Starts", icon: Flame },
                ],
            },
        ],
    },
]
