interface TabItem {
    key: string
    label: string
}

interface TabNavigationProps {
    tabs: TabItem[]
    activeTab: string
    onTabChange: (tab: string) => void
}

export function TabNavigation({ tabs, activeTab, onTabChange }: TabNavigationProps) {
    return (
        <div className="sticky top-14 z-40 bg-white -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-1 border-b border-zinc-200 overflow-x-auto">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => onTabChange(tab.key)}
                        className={`px-3 sm:px-4 py-3 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === tab.key
                            ? "text-zinc-900"
                            : "text-zinc-500 hover:text-zinc-700"
                            }`}
                    >
                        {tab.label}
                        {activeTab === tab.key && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />
                        )}
                    </button>
                ))}
            </div>
        </div>
    )
}
