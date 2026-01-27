"use client"

import useSWR from "swr"
import { useAuth } from "@clerk/nextjs"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

// Tier limits
const FREE_LIMITS = {
    requests: 1_000_000,      // 1M requests
    gbSeconds: 100_000,       // 100K GB-seconds
}

const PRO_LIMITS = {
    requests: 10_000_000,     // 10M requests
    gbSeconds: 1_000_000,     // 1M GB-seconds
}

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

export function useUsage(isPro: boolean = false): UseUsageReturn {
    const { getToken } = useAuth()

    const { data, error, mutate, isLoading, isValidating } = useSWR<Usage>(
        [`${API_BASE_URL}/api/projects/usage`, getToken],
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

    // Override limits based on tier
    const limits = isPro ? PRO_LIMITS : FREE_LIMITS
    const adjustedUsage = data ? {
        ...data,
        requests: {
            ...data.requests,
            limit: limits.requests,
        },
        gbSeconds: {
            ...data.gbSeconds,
            limit: limits.gbSeconds,
        },
    } : undefined

    return {
        usage: adjustedUsage,
        loading: isLoading,
        error,
        refresh: () => mutate(),
        isValidating,
    }
}
