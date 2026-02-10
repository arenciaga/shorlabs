'use client'

import { useCallback } from "react"
import { SWRConfig, type Cache } from "swr"
import { AutumnProvider } from "autumn-js/react"
import { useAuth } from "@clerk/nextjs"

const STORAGE_KEY = "shorlabs_swr_cache"

/**
 * SWR cache provider backed by localStorage.
 *
 * On initialisation it rehydrates the in-memory Map from localStorage,
 * and on every window `beforeunload` it persists the current Map back.
 * This means Autumn's customer data (and any other SWR keys) survive
 * page navigations and hard reloads, so the UI renders instantly with
 * the last-known data while SWR revalidates in the background.
 */
function localStorageProvider(): Cache {
    // Rehydrate from localStorage into the initial Map
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: Map<string, any>
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map = stored ? new Map<string, any>(JSON.parse(stored)) : new Map<string, any>()
    } catch {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map = new Map<string, any>()
    }

    // Persist to localStorage before the page unloads
    if (typeof window !== "undefined") {
        window.addEventListener("beforeunload", () => {
            try {
                const entries = Array.from(map.entries())
                localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
            } catch {
                // Storage full or unavailable — silently ignore
            }
        })
    }

    return map as Cache
}

export function AutumnProviderWrapper({ children }: { children: React.ReactNode }) {
    const { getToken } = useAuth()

    // Stable reference so SWRConfig doesn't re-create the provider on every render
    const provider = useCallback(localStorageProvider, [])

    return (
        <SWRConfig
            value={{
                provider,
                dedupingInterval: 60_000,        // 60s — don't re-fetch within a minute
                revalidateOnFocus: false,         // Don't re-fetch on window focus
                keepPreviousData: true,           // Keep stale data while revalidating
            }}
        >
            <AutumnProvider
                getBearerToken={async () => {
                    const token = await getToken()
                    return token
                }}
            >
                {children}
            </AutumnProvider>
        </SWRConfig>
    )
}
