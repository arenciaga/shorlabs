"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Sparkles, Menu, X, ChevronRight } from "lucide-react"
import { OrganizationSwitcher, UserButton, useAuth } from "@clerk/nextjs"

import {
    NavigationMenu,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"
import { UpgradeModal, useUpgradeModal } from "@/components/upgrade-modal"
import { cn } from "@/lib/utils"
import { fetchProject } from "@/lib/api"

const navItems = [
    { title: "Projects", href: "/projects" },
    { title: "Settings", href: "/settings" },
] as const

interface AppNavbarProps {
    projectId?: string
}

function useProjectName(projectId?: string) {
    const { getToken, orgId } = useAuth()
    const [name, setName] = React.useState<string | null>(null)

    React.useEffect(() => {
        if (!projectId || !orgId) {
            setName(null)
            return
        }

        let cancelled = false
        ;(async () => {
            try {
                const token = await getToken()
                if (!token || cancelled) return
                const data = await fetchProject(token, projectId, orgId)
                if (!cancelled) setName(data.project.name)
            } catch {
                if (!cancelled) setName(null)
            }
        })()

        return () => { cancelled = true }
    }, [projectId, orgId, getToken])

    return name
}

export function AppNavbar({ projectId }: AppNavbarProps) {
    const pathname = usePathname()
    const [mounted, setMounted] = React.useState(false)
    const [mobileOpen, setMobileOpen] = React.useState(false)
    const { isOpen, openUpgradeModal, closeUpgradeModal } = useUpgradeModal()
    const projectName = useProjectName(projectId)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    // Close mobile menu on route change
    React.useEffect(() => {
        setMobileOpen(false)
    }, [pathname])

    const isProjectPage = !!projectId

    return (
        <>
            <header className="sticky top-0 z-50 w-full bg-white">
                {/* ── Main bar ── */}
                <div className="flex h-14 items-center px-4 sm:px-6">

                    {/* Left group */}
                    <div className="flex items-center min-w-0">
                        {/* Logo */}
                        <Link href="/projects" className="shrink-0 mr-3">
                            <Image
                                src="/favicon.ico"
                                alt="Shorlabs"
                                width={22}
                                height={22}
                                className="rounded-full"
                                priority
                            />
                        </Link>

                        {/* Divider + OrgSwitcher — hidden on mobile */}
                        <div className="hidden md:flex items-center">
                            <div className="h-5 w-px bg-zinc-200 mr-3 shrink-0" />
                            {mounted ? (
                                <OrganizationSwitcher
                                    appearance={{
                                        elements: {
                                            organizationSwitcherTrigger:
                                                "text-sm font-semibold text-zinc-900 hover:bg-zinc-100 rounded-none px-2 py-1.5",
                                            organizationSwitcherTriggerIcon: "w-5 h-5",
                                            organizationPreviewAvatarBox: "w-5 h-5",
                                            organizationPreviewMainIdentifier:
                                                "text-sm font-semibold text-zinc-900",
                                        },
                                    }}
                                    hidePersonal={false}
                                />
                            ) : (
                                <div className="h-7 w-36 rounded-none bg-zinc-100 animate-pulse" />
                            )}
                        </div>

                        {/* Divider + Nav links OR Breadcrumb — hidden on mobile */}
                        <div className="hidden md:flex items-center">
                            <div className="h-5 w-px bg-zinc-200 mx-3 shrink-0" />

                            {isProjectPage ? (
                                /* Breadcrumb: Projects > project-name */
                                <div className="flex items-center gap-1.5">
                                    <Link
                                        href="/projects"
                                        className="text-xs font-mono tracking-[0.18em] uppercase text-zinc-500 hover:text-zinc-900 transition-colors"
                                    >
                                        Projects
                                    </Link>
                                    <ChevronRight className="h-3.5 w-3.5 text-zinc-300 shrink-0" />
                                    {projectName ? (
                                        <span className="text-xs font-mono tracking-[0.18em] uppercase text-zinc-900 font-medium truncate max-w-[200px]">
                                            {projectName}
                                        </span>
                                    ) : (
                                        <div className="h-4 w-24 bg-zinc-100 animate-pulse" />
                                    )}
                                </div>
                            ) : (
                                /* Normal nav links */
                                <NavigationMenu>
                                    <NavigationMenuList>
                                        {navItems.map((item) => {
                                            const isActive = pathname.startsWith(item.href)
                                            return (
                                                <NavigationMenuItem key={item.href}>
                                                    <NavigationMenuLink
                                                        asChild
                                                        className={cn(
                                                            navigationMenuTriggerStyle(),
                                                            "h-9 rounded-none px-3 text-xs font-mono tracking-[0.18em] uppercase transition-colors bg-transparent hover:bg-zinc-100",
                                                            isActive
                                                                ? "text-zinc-900 bg-zinc-100"
                                                                : "text-zinc-500 hover:text-zinc-900"
                                                        )}
                                                    >
                                                        <Link href={item.href}>{item.title}</Link>
                                                    </NavigationMenuLink>
                                                </NavigationMenuItem>
                                            )
                                        })}
                                    </NavigationMenuList>
                                </NavigationMenu>
                            )}
                        </div>
                    </div>

                    {/* Right group */}
                    <div className="ml-auto flex items-center gap-3">
                        {/* User button */}
                        {mounted ? (
                            <UserButton
                                appearance={{
                                    elements: {
                                        userButtonAvatarBox: "w-8 h-8",
                                        userButtonBox: "flex-row-reverse",
                                    },
                                }}
                            >
                                <UserButton.MenuItems>
                                    <UserButton.Action
                                        label="Upgrade Plan"
                                        labelIcon={<Sparkles className="w-4 h-4" />}
                                        onClick={openUpgradeModal}
                                    />
                                </UserButton.MenuItems>
                            </UserButton>
                        ) : (
                            <div className="w-8 h-8 rounded-none bg-zinc-200 animate-pulse" />
                        )}

                        {/* Hamburger — mobile only */}
                        <button
                            className="md:hidden p-1.5 rounded-none border border-zinc-900 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                            onClick={() => setMobileOpen((o) => !o)}
                            aria-label="Toggle menu"
                        >
                            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                        </button>
                    </div>
                </div>

                {/* ── Mobile drawer ── */}
                {mobileOpen && (
                    <div className="md:hidden border-t border-zinc-100 bg-white px-4 pb-4 pt-3 space-y-3">
                        {/* Org switcher on mobile */}
                        {mounted && (
                            <div className="pb-3 border-b border-zinc-100">
                                <OrganizationSwitcher
                                    appearance={{
                                        elements: {
                                            organizationSwitcherTrigger:
                                                "text-sm font-semibold text-zinc-900 hover:bg-zinc-100 rounded-none px-2 py-1.5 w-full",
                                            organizationSwitcherTriggerIcon: "w-5 h-5",
                                            organizationPreviewAvatarBox: "w-5 h-5",
                                            organizationPreviewMainIdentifier:
                                                "text-sm font-semibold text-zinc-900",
                                        },
                                    }}
                                    hidePersonal={false}
                                />
                            </div>
                        )}

                        {/* Nav links or breadcrumb on mobile */}
                        <nav className="flex flex-col gap-1">
                            {isProjectPage ? (
                                <>
                                    <Link
                                        href="/projects"
                                        className="flex items-center px-3 py-2.5 rounded-none text-xs font-mono tracking-[0.18em] uppercase text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
                                    >
                                        Projects
                                    </Link>
                                    <div className="flex items-center px-3 py-2.5 rounded-none text-xs font-mono tracking-[0.18em] uppercase bg-zinc-100 text-zinc-900">
                                        <ChevronRight className="h-3 w-3 text-zinc-400 mr-2 shrink-0" />
                                        <span className="truncate">{projectName || "..."}</span>
                                    </div>
                                </>
                            ) : (
                                navItems.map((item) => {
                                    const isActive = pathname.startsWith(item.href)
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={cn(
                                                "flex items-center px-3 py-2.5 rounded-none text-xs font-mono tracking-[0.18em] uppercase transition-colors",
                                                isActive
                                                    ? "bg-zinc-100 text-zinc-900"
                                                    : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
                                            )}
                                        >
                                            {item.title}
                                        </Link>
                                    )
                                })
                            )}
                        </nav>
                    </div>
                )}
            </header>

            <UpgradeModal isOpen={isOpen} onClose={closeUpgradeModal} />
        </>
    )
}
