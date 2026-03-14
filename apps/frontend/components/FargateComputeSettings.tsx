'use client'

import { Cpu } from 'lucide-react'

const FARGATE_COMPUTE_OPTIONS = [
    { cpu: 256, memory: 512, label: "0.25 vCPU / 512 MB" },
    { cpu: 512, memory: 1024, label: "0.5 vCPU / 1 GB" },
    { cpu: 1024, memory: 2048, label: "1 vCPU / 2 GB" },
    { cpu: 2048, memory: 4096, label: "2 vCPU / 4 GB" },
]

interface FargateComputeSettingsProps {
    cpu: number
    memory: number
    onSelect: (cpu: number, memory: number) => void
}

export function FargateComputeSettings({
    cpu,
    memory,
    onSelect,
}: FargateComputeSettingsProps) {
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
                    {FARGATE_COMPUTE_OPTIONS.map((option, index) => {
                        const isSelected = cpu === option.cpu && memory === option.memory
                        return (
                            <button
                                key={index}
                                onClick={() => onSelect(option.cpu, option.memory)}
                                className={`flex items-center gap-3 p-4 border rounded-none transition-all text-left ${
                                    isSelected
                                        ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900"
                                        : "border-zinc-200 hover:border-zinc-400"
                                }`}
                            >
                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                    isSelected ? "border-zinc-900 bg-zinc-900" : "border-zinc-300"
                                }`}>
                                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-zinc-900">{option.label}</p>
                                    <p className="text-xs text-zinc-500 mt-0.5">
                                        {option.cpu / 1024} vCPU &middot; {option.memory >= 1024 ? `${option.memory / 1024} GB` : `${option.memory} MB`} RAM
                                    </p>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
