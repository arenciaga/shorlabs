import { Loader2, Cpu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ComputeSettings } from "@/components/ComputeSettings"
import { ECSComputeSettings } from "@/components/ECSComputeSettings"
import type { ProjectCompat } from "./types"

interface ComputeTabProps {
    project: ProjectCompat
    serviceType: "web-app" | "web-service"
    editingCompute: boolean
    memoryValue: number
    timeoutValue: number
    ephemeralStorageValue: number
    cpuValue: number
    savingCompute: boolean
    currentPlan: string | null
    onMemoryChange: (value: number) => void
    onTimeoutChange: (value: number) => void
    onEphemeralStorageChange: (value: number) => void
    onCpuChange: (value: number) => void
    onStartEditing: (overrides?: { memory?: number; timeout?: number; ephemeral_storage?: number; cpu?: number }) => void
    onSave: () => void
    onCancel: () => void
    onUpgradeClick: () => void
}

export function ComputeTab({
    project,
    serviceType,
    editingCompute,
    memoryValue,
    timeoutValue,
    ephemeralStorageValue,
    cpuValue,
    savingCompute,
    currentPlan,
    onMemoryChange,
    onTimeoutChange,
    onEphemeralStorageChange,
    onCpuChange,
    onStartEditing,
    onSave,
    onCancel,
    onUpgradeClick,
}: ComputeTabProps) {
    const isWebService = serviceType === "web-service"

    return (
        <div className="space-y-6">
            {isWebService ? (
                <ECSComputeSettings
                    cpu={editingCompute ? cpuValue : (project.cpu || 2048)}
                    memory={editingCompute ? memoryValue : (project.memory || 1024)}
                    onSelect={(cpu: number, memory: number) => {
                        if (!editingCompute) {
                            onStartEditing({ cpu, memory })
                        } else {
                            onCpuChange(cpu)
                            onMemoryChange(memory)
                        }
                    }}
                    plan={currentPlan as "hobby" | "plus" | "pro" ?? "hobby"}
                    onUpgradeClick={onUpgradeClick}
                />
            ) : (
                <ComputeSettings
                    memory={editingCompute ? memoryValue : (project.memory || 1024)}
                    timeout={editingCompute ? timeoutValue : (project.timeout || 30)}
                    ephemeralStorage={editingCompute ? ephemeralStorageValue : (project.ephemeral_storage || 1024)}
                    onMemoryChange={(value) => {
                        if (!editingCompute) {
                            onStartEditing({ memory: value })
                        } else {
                            onMemoryChange(value)
                        }
                    }}
                    onTimeoutChange={(value) => {
                        if (!editingCompute) {
                            onStartEditing({ timeout: value })
                        } else {
                            onTimeoutChange(value)
                        }
                    }}
                    onEphemeralStorageChange={(value) => {
                        if (!editingCompute) {
                            onStartEditing({ ephemeral_storage: value })
                        } else {
                            onEphemeralStorageChange(value)
                        }
                    }}
                    plan={currentPlan as "hobby" | "plus" | "pro" ?? "hobby"}
                    onUpgradeClick={onUpgradeClick}
                />
            )}

            {/* Save Button */}
            {editingCompute && (
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={onCancel}
                        className="rounded-full"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={onSave}
                        disabled={savingCompute}
                        className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-full"
                    >
                        {savingCompute && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Save Compute Settings
                    </Button>
                </div>
            )}

            {/* Info Note */}
            <div className="bg-blue-50 rounded-none border border-blue-100 p-6">
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-none bg-blue-100 flex items-center justify-center shrink-0">
                        <Cpu className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                        <h4 className="font-semibold text-blue-900 mb-1">Compute Configuration</h4>
                        <p className="text-sm text-blue-700">
                            Changes to compute settings will take effect on the next deployment. Redeploy your project to apply the new configuration.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
