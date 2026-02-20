"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Sparkles } from "lucide-react"
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs"

import {
    NavigationMenu,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"
import { UpgradeModal, useUpgradeModal } from "@/components/upgrade-modal"
import { cn } from "@/lib/utils"

const navItems = [
    { title: "Projects", href: "/projects" },
    { title: "Settings", href: "/settings" },
] as const

export function AppNavbar() {
    const pathname = usePathname()
    const [mounted, setMounted] = React.useState(false)
    const { isOpen, openUpgradeModal, closeUpgradeModal } = useUpgradeModal()

    React.useEffect(() => {
        setMounted(true)
    }, [])

    return (
        <>
            <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
                <div className="flex h-14 items-center px-4 sm:px-6">
                    {/* Left: Logo | OrgSwitcher + Nav Links */}
                    <div className="flex items-center gap-0 shrink-0">
                        {/* Logo */}
                        <Image
                            src="/favicon.ico"
                            alt="Shorlabs"
                            width={22}
                            height={22}
                            className="rounded-full shrink-0 mr-3"
                            priority
                        />

                        {/* Divider */}
                        <div className="h-5 w-px bg-zinc-200 mr-3 shrink-0" />

                        {/* Org Switcher */}
                        {mounted ? (
                            <OrganizationSwitcher
                                appearance={{
                                    elements: {
                                        organizationSwitcherTrigger:
                                            "text-sm font-semibold text-zinc-900 hover:bg-zinc-100 rounded-lg px-2 py-1.5",
                                        organizationSwitcherTriggerIcon: "w-5 h-5",
                                        organizationPreviewAvatarBox: "w-5 h-5",
                                        organizationPreviewMainIdentifier:
                                            "text-sm font-semibold text-zinc-900",
                                    },
                                }}
                                hidePersonal={false}
                            />
                        ) : (
                            <div className="h-7 w-36 rounded-lg bg-zinc-100 animate-pulse" />
                        )}

                        {/* Divider */}
                        <div className="h-5 w-px bg-zinc-200 mx-3 shrink-0" />

                        {/* Nav Links */}
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
                                                    "h-9 px-3 text-sm font-medium transition-colors bg-transparent hover:bg-zinc-100",
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
                    </div>

                    {/* Right: User Button */}
                    <div className="ml-auto flex items-center">
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
                            <div className="w-8 h-8 rounded-full bg-zinc-200 animate-pulse" />
                        )}
                    </div>
                </div>
            </header>

            <UpgradeModal isOpen={isOpen} onClose={closeUpgradeModal} />
        </>
    )
}
