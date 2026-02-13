'use client'

import { useState } from 'react'
import { useCustomer } from 'autumn-js/react'
import { Loader2 } from 'lucide-react'

import { PricingCard } from '@/components/pricing-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useIsPro } from '@/hooks/use-is-pro'
import { PLANS } from '@/lib/plans'
import { cn } from '@/lib/utils'

interface UpgradeModalProps {
    isOpen: boolean
    onClose: () => void
}

export function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
    const { attach, cancel } = useCustomer()
    const { currentPlan, activeProduct, isCanceling: isDowngradeScheduled, scheduledPlanId, isLoaded } = useIsPro()
    const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)

    const handleSelectPlan = async (productId: string) => {
        if (productId === currentPlan) return
        setActionError(null)
        setLoadingPlan(productId)
        try {
            // Downgrade: cancel the current paid product (reverts to free tier at period end)
            if (productId === "hobby" && currentPlan && currentPlan !== "hobby") {
                const result = await cancel({ productId: String(activeProduct?.id ?? currentPlan) })
                if (result.error) {
                    setActionError(result.error.message || "Failed to downgrade plan. Please try again.")
                    return
                }
                onClose()
                return
            }

            // Upgrade: attach the new paid product
            const result = await attach({
                productId,
                successUrl: `${window.location.origin}/projects`,
            })
            if (result.error) {
                setActionError(result.error.message || "Failed to update plan. Please try again.")
                return
            }

            // When no checkout is required, close the panel.
            if (!result.data || !('checkout_url' in result.data) || !result.data.checkout_url) {
                onClose()
            }
        } catch (err) {
            setActionError("Failed to update plan. Please try again.")
            console.error("Plan change failed:", err)
        } finally {
            setLoadingPlan(null)
        }
    }

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent
                side="right"
                className="w-full gap-0 border-l border-zinc-200 bg-zinc-50 p-0 md:!w-full md:!max-w-none"
            >
                <div className="h-full overflow-y-auto px-5 py-8 sm:px-6 sm:py-8">
                    <SheetHeader className="space-y-3 p-0 text-center">
                        <SheetTitle className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
                            Upgrade your plan
                        </SheetTitle>
                        <SheetDescription className="text-sm text-zinc-500">
                            Start free, scale as you grow. No surprises.
                        </SheetDescription>

                        <div className="mx-auto inline-flex items-center rounded-full border border-zinc-200 bg-zinc-100 p-0.5">
                            <Button
                                type="button"
                                size="sm"
                                className="h-8 rounded-full bg-white px-3 text-sm text-zinc-900 shadow-xs hover:bg-white"
                            >
                                Business
                            </Button>
                        </div>
                    </SheetHeader>

                    <div className="mx-auto mt-6 grid w-full max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
                        {PLANS.map((plan) => {
                            const isCurrent = currentPlan != null && plan.id === currentPlan
                            const isScheduledTarget = isDowngradeScheduled && plan.id === scheduledPlanId
                            const isLoading = loadingPlan === plan.id
                            const isPro = plan.id === "pro"
                            const isPlus = plan.id === "plus"
                            const isFree = plan.id === "hobby"
                            const isPaidPlan = isPro || isPlus

                            // Determine button text based on plan state
                            let buttonText: string
                            if (isCurrent) {
                                buttonText = "Current plan"
                            } else if (isScheduledTarget) {
                                buttonText = "Starts at period end"
                            } else if (isFree) {
                                if (isDowngradeScheduled && scheduledPlanId === "hobby") {
                                    buttonText = "Switching at period end"
                                } else {
                                    buttonText = "Switch to Hobby"
                                }
                            } else {
                                buttonText = `Upgrade to ${plan.name}`
                            }

                            return (
                                <PricingCard
                                    key={plan.id}
                                    plan={plan}
                                    highlighted={isCurrent}
                                    renderBadge={() => {
                                        if (isCurrent && isPaidPlan && isDowngradeScheduled) {
                                            return (
                                                <Badge className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                                                    Cancels at period end
                                                </Badge>
                                            )
                                        }
                                        if (isScheduledTarget) {
                                            return (
                                                <Badge className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                                                    Starts at period end
                                                </Badge>
                                            )
                                        }
                                        if (isCurrent) {
                                            return (
                                                <Badge className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                                                    Current
                                                </Badge>
                                            )
                                        }
                                        if (isPaidPlan) {
                                            return (
                                                <Badge className="rounded-full bg-gradient-to-r from-violet-500 to-blue-500 px-2 py-0.5 text-xs font-medium text-white">
                                                    14 day free trial
                                                </Badge>
                                            )
                                        }
                                        return null
                                    }}
                                    renderAction={() => (
                                        <Button
                                            type="button"
                                            onClick={() => handleSelectPlan(plan.id)}
                                            disabled={isCurrent || isScheduledTarget || isLoading || !isLoaded || (isFree && isDowngradeScheduled && scheduledPlanId === "hobby")}
                                            variant={isPro && !isCurrent && !isScheduledTarget ? "default" : "outline"}
                                            className={cn(
                                                "h-10 w-full rounded-full text-sm font-medium",
                                                isPro && !isCurrent && !isScheduledTarget && "bg-zinc-900 text-white hover:bg-zinc-800",
                                                (isCurrent || isScheduledTarget || (isFree && isDowngradeScheduled && scheduledPlanId === "hobby")) && "border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-100",
                                                !isPaidPlan && !isCurrent && !isScheduledTarget && !(isFree && isDowngradeScheduled && scheduledPlanId === "hobby") && "border-zinc-200 text-zinc-700 hover:bg-zinc-50",
                                            )}
                                        >
                                            {isLoading ? (
                                                <Loader2 className="size-4 animate-spin" />
                                            ) : (
                                                buttonText
                                            )}
                                        </Button>
                                    )}
                                />
                            )
                        })}
                    </div>

                    {actionError && (
                        <p className="mt-4 text-center text-sm text-red-600" role="alert">
                            {actionError}
                        </p>
                    )}
                </div>
            </SheetContent>
        </Sheet>
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
