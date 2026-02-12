"use client"

import { useCustomer } from "autumn-js/react"

/**
 * Hook to check the current organization's plan status via Autumn.
 *
 * SWR caching (including localStorage persistence) is handled globally
 * by the SWRConfig provider in AutumnProviderWrapper, so this hook
 * doesn't need any custom cache logic — it just derives plan state
 * from the customer object that SWR keeps warm.
 *
 * All plan detection across the app goes through this single hook.
 *
 * Plan ids must match PLANS in lib/plans.ts: "hobby" | "plus" | "pro".
 */

const BILLABLE_STATUSES = new Set(["active", "trialing", "past_due", "scheduled"])

/** Paid plan ids in priority order (pro over plus when both present). */
const PAID_PLAN_IDS = ["pro", "plus"] as const

function normalizeProductId(id: unknown): string {
    return String(id ?? "").trim().toLowerCase()
}

function productMatchesPlan(product: { id: unknown; status?: string }, planId: string): boolean {
    return normalizeProductId(product.id) === planId && BILLABLE_STATUSES.has(product.status ?? "")
}

export function useIsPro() {
    const { customer, isLoading } = useCustomer()

    const products = customer?.products ?? []
    const hasCustomerData = !!customer

    // Single pass: find which paid plan (if any) the customer has. Pro wins over Plus.
    let currentPlan: "pro" | "plus" | "hobby" | undefined = hasCustomerData ? "hobby" : undefined
    let activeProduct: (typeof products)[number] | null = null

    for (const planId of PAID_PLAN_IDS) {
        const product = products.find((p) => productMatchesPlan(p, planId))
        if (product) {
            currentPlan = planId
            activeProduct = product
            break
        }
    }

    const isPro = currentPlan === "pro" || currentPlan === "plus"
    const isTrialing = activeProduct?.status === "trialing"
    const isCanceling = !!activeProduct?.canceled_at

    /** Display label: "Hobby" | "Plus" | "Plus Trial" | "Pro" | "Pro Trial" */
    const planLabel: "Hobby" | "Plus" | "Plus Trial" | "Pro" | "Pro Trial" =
        currentPlan === "hobby"
            ? "Hobby"
            : currentPlan === "pro"
                ? isTrialing
                    ? "Pro Trial"
                    : "Pro"
                : currentPlan === "plus"
                    ? isTrialing
                        ? "Plus Trial"
                        : "Plus"
                    : "Hobby"

    const proProduct = currentPlan === "pro" ? activeProduct : null
    const plusProduct = currentPlan === "plus" ? activeProduct : null

    return {
        isPro,
        isTrialing,
        isCanceling,
        currentPlan,
        planLabel,
        proProduct,
        plusProduct,
        activeProduct,
        isLoaded: hasCustomerData,
        customer,
    }
}
