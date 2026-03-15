'use client'

import { Check, Cpu, Lock } from 'lucide-react'
import { EC2_COMPUTE_OPTIONS, hasAccessToPlan } from '@/lib/compute-options'
import type { PlanTier } from '@/lib/compute-options'

interface ECSComputeSettingsProps {
    cpu: number
    memory: number
    onSelect: (cpu: number, memory: number) => void
    plan: PlanTier
    onUpgradeClick: () => void
}

export function ECSComputeSettings({
    cpu,
    memory,
    onSelect,
    plan,
    onUpgradeClick,
}: ECSComputeSettingsProps) {
    const handleSelect = (option: typeof EC2_COMPUTE_OPTIONS[0]) => {
        if (!hasAccessToPlan(plan, option.minPlan)) {
            onUpgradeClick()
            return
        }
        onSelect(option.cpu, option.memory)
    }

    return (
        <div className="bg-white rounded-none border border-zinc-200 overflow-hidden">
            <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-zinc-100">
                <Cpu className="h-5 w-5 text-zinc-400" />
                <h3 className="font-semibold text-zinc-900">Container Size</h3>
            </div>
            <div className="p-4 sm:p-6">
                <p className="text-sm text-zinc-500 mb-4">
                    Choose the CPU and memory allocation for your container.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {EC2_COMPUTE_OPTIONS.map((option, index) => {
                        const isSelected = cpu === option.cpu && memory === option.memory
                        const isLocked = !hasAccessToPlan(plan, option.minPlan)
                        return (
                            <button
                                key={index}
                                onClick={() => handleSelect(option)}
                                className={`relative flex items-center gap-3 p-4 border rounded-none transition-all text-left ${
                                    isSelected
                                        ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900"
                                        : isLocked
                                            ? "border-zinc-200 bg-zinc-50/50 opacity-75 cursor-not-allowed"
                                            : "border-zinc-200 hover:border-zinc-400"
                                }`}
                            >
                                {option.badge && (
                                    <span className="absolute -top-2 -right-2 bg-zinc-900 text-white text-xs font-medium px-2 py-0.5 rounded-full">
                                        {option.badge}
                                    </span>
                                )}
                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                    isSelected ? "border-zinc-900 bg-zinc-900" : "border-zinc-300"
                                }`}>
                                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                </div>
                                <div className="flex-1">
                                    <p className={`text-sm font-medium ${isLocked ? 'text-zinc-500' : 'text-zinc-900'}`}>
                                        {option.cpu / 1024} vCPU / {option.memory >= 1024 ? `${option.memory / 1024} GB` : `${option.memory} MB`}
                                    </p>
                                </div>
                                {isLocked && (
                                    <Lock className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
