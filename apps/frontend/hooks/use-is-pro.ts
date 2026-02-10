"use client"

import { useCustomer } from "autumn-js/react"

/**
 * Hook to check if the current organization has a Pro subscription via Autumn.
 *
 * Replaces the old Clerk-based `has?.({ plan: 'shorlabs_pro_user' })` check.
 * Looks for an active product with id "pro" in the customer's products array.
 *
 * @returns {{ isPro: boolean, isLoaded: boolean, customer: Customer | null }}
 */
export function useIsPro() {
    const { customer, isLoading } = useCustomer()

    const isPro = customer?.products?.some(
        (product) =>
            product.id === "pro" &&
            (product.status === "active" || product.status === "trialing")
    ) ?? false

    return {
        isPro,
        isLoaded: !isLoading,
        customer,
    }
}
