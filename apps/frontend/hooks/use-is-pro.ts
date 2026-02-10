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
 */

const BILLABLE_STATUSES = new Set(["active", "trialing", "past_due", "scheduled"])

export function useIsPro() {
    const { customer, isLoading } = useCustomer()

    const proProduct = customer?.products?.find(
        (product) => product.id === "pro" && BILLABLE_STATUSES.has(product.status)
    )

    const hasCustomerData = !!customer
    const isPro = hasCustomerData ? !!proProduct : false
    const isCanceling = hasCustomerData
        ? (!!proProduct && !!proProduct.canceled_at)
        : false
    const currentPlan: "pro" | "hobby" | undefined = hasCustomerData
        ? (isPro ? "pro" : "hobby")
        : undefined

    return {
        isPro,
        isCanceling,
        currentPlan,
        proProduct: proProduct ?? null,
        isLoaded: hasCustomerData,
        customer,
    }
}
