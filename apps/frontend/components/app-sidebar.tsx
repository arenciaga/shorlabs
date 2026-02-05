"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { ChevronLeft, FolderKanban, Settings, Sparkles } from "lucide-react"
import Link from "next/link"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs"
import { UpgradeModal, useUpgradeModal } from "@/components/upgrade-modal"

// Navigation items
const navItems = [
  {
    title: "Projects",
    url: "/projects",
    icon: FolderKanban,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
] as const


export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const [mounted, setMounted] = React.useState(false)
  const { isOpen, openUpgradeModal, closeUpgradeModal } = useUpgradeModal()

  // Prevent hydration mismatch with Clerk components
  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Check if a nav item is active
  const isNavItemActive = (url: string) => {
    return pathname.startsWith(url)
  }

  return (
    <>
      <Sidebar
        collapsible="icon"
        className="bg-zinc-50 border-r border-zinc-200"
        {...props}
      >
        <SidebarHeader className="px-3 py-4 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-2">
          {/* Expanded state */}
          <div className="flex items-center justify-between px-2 py-1.5 group-data-[collapsible=icon]:hidden">
            <div>
              <OrganizationSwitcher
                appearance={{
                  elements: {
                    organizationSwitcherTrigger: "text-sm font-semibold text-slate-900 hover:bg-slate-100 rounded-lg px-2 py-1.5",
                    organizationSwitcherTriggerIcon: "w-6 h-6",
                    organizationPreviewAvatarBox: "w-6 h-6",
                    organizationPreviewMainIdentifier: "text-sm font-semibold text-slate-900"
                  }
                }}
                hidePersonal={false}
              />
            </div>
            <SidebarTrigger className="h-6 w-6 p-0 hover:bg-slate-100 rounded cursor-pointer">
              <ChevronLeft className="h-4 w-4 text-slate-400" />
            </SidebarTrigger>
          </div>

          {/* Collapsed state */}
          <div className="group-data-[collapsible=icon]:block hidden">
            <SidebarTrigger className="w-full px-2 py-2.5 rounded-lg hover:bg-slate-100 transition-all cursor-pointer">
              <div className="w-5 h-5 rounded bg-amber-600"></div>
            </SidebarTrigger>
          </div>
        </SidebarHeader>

        <SidebarContent className="px-3 group-data-[collapsible=icon]:px-2">
          <SidebarMenu className="space-y-2">
            {navItems.map((item) => {
              const isActive = isNavItemActive(item.url)
              const Icon = item.icon

              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive}>
                    <Link
                      href={item.url}
                      className={`flex items-center gap-2 px-2 py-2 rounded-lg transition-colors ${isActive
                        ? 'bg-slate-100 text-black'
                        : 'hover:bg-slate-100 text-slate-700'
                        } w-full cursor-pointer`}
                    >
                      <Icon className="h-4 w-4 text-black" />
                      <span className="text-sm font-medium group-data-[collapsible=icon]:hidden">
                        {item.title}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="border-t border-slate-200 p-3">
          <div className="w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
            {mounted ? (
              <UserButton
                showName={true}
                appearance={{
                  elements: {
                    userButtonAvatarBox: "w-8 h-8 group-data-[collapsible=icon]:w-6 group-data-[collapsible=icon]:h-6",
                    userButtonOuterIdentifier: "text-sm font-medium text-slate-900 group-data-[collapsible=icon]:hidden",
                    userButtonBox: "flex-row-reverse w-full justify-start hover:bg-slate-100 rounded-lg px-2 py-2 transition-colors",
                    userButtonTrigger: "w-full flex items-center justify-start gap-3"
                  }
                }}
              >
                {/* Custom menu item for Upgrade */}
                <UserButton.MenuItems>
                  <UserButton.Action
                    label="Upgrade Plan"
                    labelIcon={<Sparkles className="w-4 h-4" />}
                    onClick={openUpgradeModal}
                  />
                </UserButton.MenuItems>
              </UserButton>
            ) : (
              <div className="flex items-center gap-3 px-2 py-2">
                <div className="w-8 h-8 rounded-full bg-slate-200 animate-pulse" />
                <div className="h-4 w-24 bg-slate-200 rounded animate-pulse group-data-[collapsible=icon]:hidden" />
              </div>
            )}
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* Upgrade Modal */}
      <UpgradeModal isOpen={isOpen} onClose={closeUpgradeModal} />
    </>
  )
}
