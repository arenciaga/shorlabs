"use client"

import { usePathname } from "next/navigation"
import { AppNavbar } from "./app-navbar"

export function NavbarWrapper() {
    const pathname = usePathname()
    if (pathname.startsWith("/new")) return null

    // Detect /projects/{id} — extract projectId for breadcrumb
    const projectMatch = pathname.match(/^\/projects\/([^/]+)$/)
    const projectId = projectMatch?.[1] ?? undefined

    return <AppNavbar projectId={projectId} />
}
