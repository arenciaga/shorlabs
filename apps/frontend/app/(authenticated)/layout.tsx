import { NavbarWrapper } from "@/components/navbar-wrapper"

export default function AuthenticatedLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <>
            <NavbarWrapper />
            <main className="w-full">
                {children}
            </main>
        </>
    )
}
