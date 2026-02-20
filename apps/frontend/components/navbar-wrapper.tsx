"use client"

import { usePathname } from "next/navigation"
import { AppNavbar } from "./app-navbar"

export function NavbarWrapper() {
    const pathname = usePathname()
    if (pathname.startsWith("/new")) return null
    return <AppNavbar />
}
