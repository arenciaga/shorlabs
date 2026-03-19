import { Clock, Cpu, Flame, Globe, Hammer, HardDrive, type LucideIcon, Minus, Server, Zap } from 'lucide-react'

export interface PlanFeature {
    label: string
    icon: LucideIcon
    /** If true, feature is a boolean perk (renders a checkmark). Otherwise renders the feature icon. */
    isBoolean?: boolean
}

export interface FeatureGroup {
    category: string
    features: PlanFeature[]
    /** If false, the group is shown grayed out as unavailable. Defaults to true. */
    available?: boolean
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
    memoryTime: "$0.000002165 per GB / sec",
} as const

export const PLANS: Plan[] = [
    {
        id: "hobby",
        name: "Hobby",
        description: "Free with fixed limits. Perfect for personal projects and testing.",
        price: "$0",
        period: "/ month",
        featureGroups: [
            {
                category: "Web Apps",
                features: [
                    { label: "3K Requests / month included", icon: Globe },
                    { label: "1.2K Compute (GB-s) / month included", icon: Zap },
                    { label: "Up to 1 GB Memory", icon: Cpu },
                    { label: "Up to 30s Timeout", icon: Clock },
                    { label: "Up to 1 GB Temporary storage", icon: HardDrive },
                    { label: "Standard Builds", icon: Hammer },
                ],
            },
            {
                category: "Web Services",
                available: false,
                features: [
                    { label: "Not available on Hobby", icon: Minus },
                ],
            },
            {
                category: "Platform",
                available: false,
                features: [
                    { label: "Not available on Hobby", icon: Minus },
                ],
            },
        ],
    },
    {
        id: "plus",
        name: "Plus",
        description: "$5/mo includes $5 usage credit. Pay-as-you-go after.",
        price: "$5",
        period: "/ month",
        trialLabel: "7 day free trial",
        featureGroups: [
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
                    { label: "Up to 2 GB Memory", icon: Server },
                ],
            },
            {
                category: "Platform",
                features: [
                    { label: "Faster Builds", icon: Hammer, isBoolean: true },
                    { label: "Zero Cold Starts", icon: Flame, isBoolean: true },
                ],
            },
        ],
    },
    {
        id: "pro",
        name: "Pro",
        description: "$20/mo includes $20 usage credit. Pay-as-you-go after.",
        price: "$20",
        period: "/ month",
        highlighted: false,
        featureGroups: [
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
                    { label: "Up to 8 GB Memory", icon: Server },
                ],
            },
            {
                category: "Platform",
                features: [
                    { label: "Faster Builds", icon: Hammer, isBoolean: true },
                    { label: "Zero Cold Starts", icon: Flame, isBoolean: true },
                ],
            },
        ],
    },
]
