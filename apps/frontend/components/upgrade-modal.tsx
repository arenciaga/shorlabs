'use client'

import { useState } from 'react'
import { useCustomer } from 'autumn-js/react'
import { X, Check, Loader2 } from 'lucide-react'

const plans = [
    {
        id: "hobby",
        name: "Hobby",
        description: "For personal projects and testing",
        price: "$0",
        features: [
            "Unlimited Projects",
            "1 GB Memory",
            "Up to 30s Timeout",
            "512 MB Storage",
            "50K Requests / mo",
            "20K GB-Seconds",
        ],
    },
    {
        id: "pro",
        name: "Pro",
        description: "For production workloads at scale",
        price: "$20",
        period: "/ mo",
        features: [
            "Unlimited Projects",
            "Up to 4 GB Memory",
            "Up to 300s Timeout",
            "2 GB Storage",
            "1M Requests / mo",
            "400K GB-Seconds",
        ],
    },
]

interface UpgradeModalProps {
    isOpen: boolean
    onClose: () => void
}

export function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
    const { customer, checkout } = useCustomer()
    const [loadingPlan, setLoadingPlan] = useState<string | null>(null)

    const currentProductId = customer?.products?.find(
        (p) => p.status === "active" || p.status === "trialing"
    )?.id

    const handleSelectPlan = async (productId: string) => {
        if (productId === currentProductId) return
        setLoadingPlan(productId)
        try {
            await checkout({
                productId,
                successUrl: "/projects",
            })
        } catch (err) {
            console.error("Checkout failed:", err)
        } finally {
            setLoadingPlan(null)
        }
    }

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-black/50 z-50 transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />

            {/* Slide-out Panel */}
            <div
                className={`fixed top-0 right-0 h-full w-full md:w-[680px] bg-zinc-50 z-50 shadow-2xl transform transition-transform duration-200 ease-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-8 pt-8 pb-2">
                    <div>
                        <h2 className="text-xl font-semibold text-zinc-900">
                            Choose your plan
                        </h2>
                        <p className="text-sm text-zinc-400 mt-0.5">
                            Start free, upgrade when you need more.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-zinc-200/60 transition-colors"
                    >
                        <X className="w-4 h-4 text-zinc-400" />
                    </button>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto px-8 py-6">
                    {isOpen && (
                        <div className="space-y-4">
                            {plans.map((plan) => {
                                const isCurrent = plan.id === currentProductId
                                const isLoading = loadingPlan === plan.id
                                const isPro = plan.id === "pro"

                                return (
                                    <div
                                        key={plan.id}
                                        className={`rounded-xl border bg-white p-5 transition-all ${isCurrent
                                                ? 'border-zinc-900 ring-1 ring-zinc-900'
                                                : 'border-zinc-200 hover:border-zinc-300'
                                            }`}
                                    >
                                        <div className="flex items-start justify-between">
                                            {/* Left: plan info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2.5">
                                                    <h3 className="text-[15px] font-semibold text-zinc-900">
                                                        {plan.name}
                                                    </h3>
                                                    {isCurrent && (
                                                        <span className="text-[11px] font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
                                                            Current
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[13px] text-zinc-400 mt-0.5">
                                                    {plan.description}
                                                </p>
                                            </div>

                                            {/* Right: price + button */}
                                            <div className="flex items-center gap-4 ml-4 shrink-0">
                                                <div className="text-right">
                                                    <span className="text-2xl font-semibold text-zinc-900">
                                                        {plan.price}
                                                    </span>
                                                    {plan.period && (
                                                        <span className="text-xs text-zinc-400 ml-0.5">
                                                            {plan.period}
                                                        </span>
                                                    )}
                                                </div>
                                                {!isCurrent && (
                                                    <button
                                                        onClick={() => handleSelectPlan(plan.id)}
                                                        disabled={isLoading}
                                                        className={`rounded-lg px-4 py-2 text-[13px] font-medium transition-all cursor-pointer whitespace-nowrap ${isPro
                                                                ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                                                                : 'border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                                                            }`}
                                                    >
                                                        {isLoading ? (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        ) : isPro ? 'Upgrade' : 'Downgrade'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Features grid */}
                                        <div className="mt-4 pt-4 border-t border-zinc-100">
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                                {plan.features.map((feature) => (
                                                    <div
                                                        key={feature}
                                                        className="flex items-center gap-2 text-[12px] text-zinc-500"
                                                    >
                                                        <Check className="w-3 h-3 flex-shrink-0 text-zinc-300" strokeWidth={2.5} />
                                                        {feature}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}

// Hook to manage upgrade modal state
export function useUpgradeModal() {
    const [isOpen, setIsOpen] = useState(false)

    return {
        isOpen,
        openUpgradeModal: () => setIsOpen(true),
        closeUpgradeModal: () => setIsOpen(false),
    }
}
