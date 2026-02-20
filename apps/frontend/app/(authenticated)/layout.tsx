import { AppNavbar } from "@/components/app-navbar"

export default function AuthenticatedLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <>
            <AppNavbar />
            <main className="w-full">
                {children}
            </main>
        </>
    )
}
