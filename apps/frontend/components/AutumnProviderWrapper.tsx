'use client'

import { AutumnProvider } from "autumn-js/react"
import { useAuth } from "@clerk/nextjs"

export function AutumnProviderWrapper({ children }: { children: React.ReactNode }) {
    const { getToken } = useAuth()

    return (
        <AutumnProvider
            getBearerToken={async () => {
                const token = await getToken()
                return token
            }}
        >
            {children}
        </AutumnProvider>
    )
}
