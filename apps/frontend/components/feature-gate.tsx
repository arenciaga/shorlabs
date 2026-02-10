'use client'

import { useCustomer } from 'autumn-js/react'
import { ReactNode } from 'react'

interface FeatureGateProps {
    /**
     * The feature key to check for (must match a feature defined in Autumn Dashboard)
     * e.g., "advancedAnalytics", "prioritySupport", "apiAccess"
     */
    feature: string
    /**
     * Content to show if the user has the feature
     */
    children: ReactNode
    /**
     * Optional fallback content to show if the user doesn't have the feature
     * If not provided, nothing will be rendered
     */
    fallback?: ReactNode
}

/**
 * FeatureGate component for gating content based on subscription features.
 *
 * Uses Autumn's customer state to check feature access. Features are configured
 * in the Autumn Dashboard and tracked per organization.
 *
 * Usage:
 * ```tsx
 * <FeatureGate feature="advancedAnalytics">
 *   <AdvancedAnalyticsDashboard />
 * </FeatureGate>
 *
 * <FeatureGate
 *   feature="prioritySupport"
 *   fallback={<UpgradePrompt />}
 * >
 *   <PrioritySupportWidget />
 * </FeatureGate>
 * ```
 */
export function FeatureGate({ feature, children, fallback = null }: FeatureGateProps) {
    const { customer, isLoading } = useCustomer()

    // Show nothing while loading
    if (isLoading) {
        return null
    }

    // Check if customer has the feature via Autumn's feature map
    const customerFeature = customer?.features?.[feature]

    // Feature exists and either has remaining balance or is unlimited
    const hasFeature = !!customerFeature && (
        customerFeature.unlimited === true ||
        (customerFeature.balance !== null && customerFeature.balance !== undefined && customerFeature.balance > 0)
    )

    if (hasFeature) {
        return <>{children}</>
    }

    return <>{fallback}</>
}

/**
 * UpgradePrompt component - a default fallback for gated features
 */
export function UpgradePrompt({
    title = "Upgrade Required",
    message = "This feature requires a premium subscription.",
    ctaText = "View Plans",
    ctaHref = "/pricing"
}: {
    title?: string
    message?: string
    ctaText?: string
    ctaHref?: string
}) {
    return (
        <div className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg border border-slate-200 text-center">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                    className="w-6 h-6 text-amber-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
            <p className="text-slate-600 mb-4">{message}</p>
            <a
                href={ctaHref}
                className="inline-flex items-center px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
                {ctaText}
            </a>
        </div>
    )
}
