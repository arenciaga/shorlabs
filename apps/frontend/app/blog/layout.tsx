import SectionNavigation from "@/components/SectionNavigation";

export default function BlogLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <>
            <SectionNavigation />
            {/* offset for the fixed navbar height (h-14 = 56px) */}
            <main style={{ paddingTop: 56 }}>{children}</main>
        </>
    );
}
