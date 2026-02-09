'use client'

import { useState } from 'react'
import { PricingTable } from '@clerk/nextjs'
import { X } from 'lucide-react'

interface UpgradeModalProps {
    isOpen: boolean
    onClose: () => void
}

export function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full h-full bg-white overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
                    <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-5">
                        <h2 className="text-lg font-semibold text-gray-900">
                            Upgrade
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-1.5 -m-1.5 rounded-md hover:bg-gray-100 transition-colors"
                        >
                            <X className="w-5 h-5 text-gray-400" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div
                    className="max-w-5xl mx-auto p-6"
                    onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('button')) {
                            onClose();
                        }
                    }}
                >
                    <PricingTable
                        appearance={{
                            variables: {
                                colorPrimary: '#000000',
                                colorBackground: '#ffffff',
                                colorText: '#3f3f46',
                                colorTextSecondary: '#71717a',
                                fontFamily: 'inherit',
                                borderRadius: '12.5px',
                            },
                            elements: {
                                card: 'border-zinc-200',
                                cardHeader: 'border-b border-zinc-100',
                                cardBody: 'p-6',
                                badge: 'bg-zinc-900 text-white',
                                button: 'bg-zinc-900 hover:bg-zinc-800 text-white font-medium rounded-xl transition-colors',
                                buttonSecondary: 'border-zinc-200 text-zinc-700 hover:bg-zinc-50 rounded-xl',
                                price: 'text-zinc-900 font-bold',
                                feature: 'text-zinc-700',
                            }
                        }}
                    />
                </div>
            </div>
        </div>
    )
}

// Hook to manage upgrade modal state
export function useUpgradeModal() {
    const [isOpen, setIsOpen] = useState(false)

    return {
        isOpen,
        openUpgradeModal: () => setIsOpen(true),
        closeUpgradeModal: () => setIsOpen(false),
    }
}
