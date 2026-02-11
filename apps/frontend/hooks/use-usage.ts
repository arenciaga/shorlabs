"use client"

import useSWR from "swr"
import { useAuth } from "@clerk/nextjs"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

interface Usage {
    requests: {
        current: number
        limit: number
    }
    gbSeconds: {
        current: number
        limit: number
    }
    period: string
    lastUpdated: string
}

interface UseUsageReturn {
    usage: Usage | undefined
    loading: boolean
    error: Error | undefined
    refresh: () => void
    isValidating: boolean
}

const fetcher = async (url: string, token: string): Promise<Usage> => {
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    })

    if (!res.ok) {
        throw new Error(`Failed to fetch usage: ${res.status}`)
    }

    return res.json()
}

/**
 * Hook to fetch organization-level usage metrics.
 *
 * Usage is tracked per organization (the billing entity), not per user.
 * Tier (free/pro) is determined automatically via Autumn's useIsPro hook.
 */
export function useUsage(): UseUsageReturn {
    const { getToken, isLoaded, orgId } = useAuth()

    // Build URL with org_id parameter (usage is tracked per organization)
    const usageUrl = orgId
        ? `${API_BASE_URL}/api/projects/usage?org_id=${orgId}`
        : null  // Don't fetch if no org selected

    // Only fetch when auth is loaded and org is selected
    const { data, error, mutate, isLoading, isValidating } = useSWR<Usage>(
        isLoaded && orgId ? [usageUrl, getToken] : null,
        async ([url, tokenGetter]) => {
            const token = await (tokenGetter as () => Promise<string | null>)()
            if (!token) {
                throw new Error("Not authenticated")
            }
            return fetcher(url, token)
        },
        {
            refreshInterval: 60000, // Refresh every 60 seconds
            revalidateOnFocus: true,
            dedupingInterval: 30000, // Prevent duplicate requests within 30 seconds
            errorRetryCount: 3, // Retry up to 3 times on error
            errorRetryInterval: 5000, // Wait 5 seconds between retries
        }
    )

    return {
        usage: data,
        // Show loading if auth isn't loaded yet OR no org selected OR if SWR is loading
        loading: !isLoaded || !orgId || isLoading,
        // Don't show error if auth isn't loaded yet or no org
        error: isLoaded && orgId ? error : undefined,
        refresh: () => mutate(),
        isValidating,
    }
}
