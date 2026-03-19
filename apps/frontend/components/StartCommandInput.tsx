"use client"

import { Terminal, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"



interface StartCommandInputProps {
    /** Current value of the start command */
    value: string
    /** Callback when value changes */
    onChange: (value: string) => void
    /** Whether the component is disabled */
    disabled?: boolean
    /** Callback to start editing (for view mode) */
    onStartEdit?: () => void
    /** Callback to save changes (for edit mode) */
    onSave?: () => void
    /** Callback to cancel editing */
    onCancel?: () => void
    /** Whether save is in progress */
    isSaving?: boolean
    /** Whether in edit mode (shows save/cancel buttons) */
    isEditMode?: boolean
    /** Detected framework name (for auto-detection status) */
    detectedFramework?: string | null
    /** Whether detection is in progress */
    isDetecting?: boolean
    /** Detection confidence level */
    detectionConfidence?: "high" | "medium" | "low"
}

export function StartCommandInput({
    value,
    onChange,
    disabled = false,
    onStartEdit,
    onSave,
    onCancel,
    isSaving = false,
    isEditMode = false,
    detectedFramework,
    isDetecting = false,
    detectionConfidence = "low",
}: StartCommandInputProps) {
    // Removed deprecated template selection state

    return (
        <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-zinc-100">
                <div className="flex items-center gap-3">
                    <Terminal className="h-5 w-5 text-zinc-400" />
                    <h3 className="font-semibold text-zinc-900">Start Command</h3>

                    {/* Detection Status Badge */}
                    {isDetecting ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-500 bg-zinc-100 rounded-full">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Detecting...
                        </span>
                    ) : detectedFramework && (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${detectionConfidence === "high"
                            ? "text-emerald-700 bg-emerald-50"
                            : "text-amber-700 bg-amber-50"
                            }`}>
                            <span className="text-[10px]">✨</span>
                            Auto-detected: {detectedFramework}
                        </span>
                    )}
                </div>
                {onStartEdit && !isEditMode && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onStartEdit}
                        className="text-zinc-500 hover:text-zinc-900"
                    >
                        Edit
                    </Button>
                )}
            </div>

            <div className="p-4 sm:p-6 space-y-4">
                {/* Terminal-style Command Input - FIRST */}
                <div className="flex items-center gap-3 bg-zinc-900 rounded-xl px-4 py-3">
                    <span className="text-emerald-400 font-mono text-sm select-none shrink-0">$</span>
                    {isDetecting ? (
                        <div className="flex-1 flex items-center gap-2">
                            <div className="h-4 w-48 bg-zinc-700 rounded animate-pulse" />
                            <span className="text-zinc-500 text-sm font-mono">Detecting...</span>
                        </div>
                    ) : (
                        <input
                            type="text"
                            value={value}
                            onChange={(e) => {
                                onChange(e.target.value)
                            }}
                            placeholder="Enter your start command..."
                            disabled={disabled}
                            className="flex-1 bg-transparent font-mono text-sm text-zinc-100 placeholder:text-zinc-500 outline-none border-none caret-emerald-400 selection:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ caretColor: '#34d399' }}
                        />
                    )}
                </div>

                {/* Subtle tip - not a warning box */}
                {!isDetecting && (
                    <p className="text-xs text-zinc-500">
                        <span className="text-zinc-400">💡</span> Your application must listen on <code className="bg-zinc-100 px-1 py-0.5 rounded text-zinc-600 font-mono text-[11px]">port 8080</code>
                    </p>
                )}

                {/* Edit Mode Actions */}
                {isEditMode && onSave && onCancel && (
                    <div className="flex gap-2 pt-2">
                        <Button
                            variant="outline"
                            onClick={onCancel}
                            disabled={isSaving}
                            className="rounded-full"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={onSave}
                            disabled={isSaving || !value.trim()}
                            className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-full"
                        >
                            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            <span>Save</span>
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )
}
