"use client"

import { useState } from "react"
import {
    Plus,
    X,
    Upload,
    Settings2,
    Eye,
    EyeOff,
    FileText
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

export interface EnvVar {
    key: string
    value: string
    visible: boolean
}

interface EnvironmentVariablesEditorProps {
    /** Current list of environment variables */
    envVars: EnvVar[]
    /** Callback when env vars change */
    onChange: (envVars: EnvVar[]) => void
    /** Whether to show the "Import .env" button */
    showImport?: boolean
    /** Whether in read-only display mode (for project details when not editing) */
    readOnly?: boolean
    /** Existing env vars to display in read-only mode (key-value pairs) */
    existingEnvVars?: Record<string, string>
    /** Callback to start editing (for read-only mode) */
    onStartEdit?: () => void
    /** Whether currently in edit mode (for project details page) */
    isEditing?: boolean
    /** Callback to cancel editing */
    onCancelEdit?: () => void
    /** Callback to save changes */
    onSave?: () => void
    /** Whether save is in progress */
    isSaving?: boolean
}

export function EnvironmentVariablesEditor({
    envVars,
    onChange,
    showImport = true,
    readOnly = false,
    existingEnvVars = {},
    onStartEdit,
    isEditing = false,
    onCancelEdit,
    onSave,
    isSaving = false
}: EnvironmentVariablesEditorProps) {
    const [showEnvImport, setShowEnvImport] = useState(false)
    const [envImportText, setEnvImportText] = useState("")

    const addEnvVar = () => {
        onChange([...envVars, { key: "", value: "", visible: false }])
    }

    const removeEnvVar = (index: number) => {
        onChange(envVars.filter((_, i) => i !== index))
    }

    const updateEnvVar = (index: number, field: "key" | "value", value: string) => {
        const newVars = [...envVars]
        newVars[index][field] = field === "key" ? value.toUpperCase() : value
        onChange(newVars)
    }

    const toggleEnvVarVisibility = (index: number) => {
        const newVars = [...envVars]
        newVars[index].visible = !newVars[index].visible
        onChange(newVars)
    }

    const parseAndImportEnv = () => {
        const lines = envImportText.split("\n")
        const parsed: EnvVar[] = []

        for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith("#")) continue

            const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
            if (match) {
                const key = match[1]
                let value = match[2]

                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1)
                }

                parsed.push({ key, value, visible: false })
            }
        }

        const existingKeys = new Set(envVars.map(v => v.key))
        const merged = [
            ...envVars,
            ...parsed.filter(p => !existingKeys.has(p.key))
        ]

        onChange(merged)
        setShowEnvImport(false)
        setEnvImportText("")
    }

    // Read-only display mode (for project details when not editing)
    if (readOnly && !isEditing) {
        const envKeys = Object.keys(existingEnvVars || {})

        return (
            <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-zinc-100">
                    <div className="flex items-center gap-3">
                        <Settings2 className="h-5 w-5 text-zinc-400" />
                        <h3 className="font-semibold text-zinc-900">Environment Variables</h3>
                        {envKeys.length > 0 && (
                            <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
                                {envKeys.length}
                            </span>
                        )}
                    </div>
                    {onStartEdit && (
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

                <div className="p-4 sm:p-6">
                    {envKeys.length > 0 ? (
                        <div className="space-y-2">
                            {envKeys.map((key) => (
                                <div key={key} className="flex items-center gap-3 px-4 py-3 bg-zinc-50 rounded-xl font-mono text-sm border border-zinc-100">
                                    <span className="text-zinc-900 font-medium">{key}</span>
                                    <span className="text-zinc-300">=</span>
                                    <span className="text-zinc-500">••••••••</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-3">
                                <Plus className="h-5 w-5 text-zinc-400" />
                            </div>
                            <p className="text-sm text-zinc-500">No environment variables</p>
                        </div>
                    )}
                </div>

                {envKeys.length > 0 && (
                    <div className="px-4 sm:px-6 py-3 bg-blue-50 border-t border-blue-100">
                        <p className="text-xs text-blue-900">
                            Redeploy to apply changes
                        </p>
                    </div>
                )}
            </div>
        )
    }

    // Editable mode (for configure page or project details in edit mode)
    return (
        <>
            <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-zinc-100">
                    <div className="flex items-center gap-3">
                        <Settings2 className="h-5 w-5 text-zinc-400" />
                        <h3 className="font-semibold text-zinc-900">Environment Variables</h3>
                        {envVars.length > 0 && (
                            <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
                                {envVars.length}
                            </span>
                        )}
                    </div>
                    {showImport && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowEnvImport(true)}
                            className="rounded-full"
                        >
                            <Upload className="h-4 w-4 mr-2" />
                            Import .env
                        </Button>
                    )}
                </div>

                <div className="p-4 sm:p-6">
                    {envVars.length === 0 ? (
                        <div className="text-center py-8">
                            <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-4">
                                <Settings2 className="h-6 w-6 text-zinc-400" />
                            </div>
                            <p className="text-zinc-900 font-medium mb-1">No environment variables</p>
                            <p className="text-sm text-zinc-500 mb-4">
                                Add variables that will be available during build and runtime.
                            </p>
                            <Button
                                variant="outline"
                                onClick={addEnvVar}
                                className="rounded-full"
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                Add Variable
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {envVars.map((env, index) => (
                                <div key={index} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                                    <Input
                                        placeholder="KEY"
                                        value={env.key}
                                        onChange={(e) => updateEnvVar(index, "key", e.target.value)}
                                        className="sm:flex-1 font-mono text-sm h-11 rounded-xl"
                                    />
                                    <div className="flex-1 relative">
                                        <Input
                                            type={env.visible ? "text" : "password"}
                                            placeholder="Value"
                                            value={env.value}
                                            onChange={(e) => updateEnvVar(index, "value", e.target.value)}
                                            className="font-mono text-sm h-11 rounded-xl pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => toggleEnvVarVisibility(index)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                                        >
                                            {env.visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeEnvVar(index)}
                                        className="h-11 w-11 text-zinc-400 hover:text-red-500 hover:bg-red-50 shrink-0 rounded-xl self-end sm:self-auto"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                            <Button
                                type="button"
                                variant="outline"
                                onClick={addEnvVar}
                                className="w-full rounded-xl border-dashed border-zinc-300 text-zinc-500 hover:text-zinc-900 hover:border-zinc-400 h-11"
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                Add Variable
                            </Button>

                            {/* Save/Cancel buttons for edit mode */}
                            {isEditing && onCancelEdit && onSave && (
                                <div className="flex gap-2 pt-3 border-t border-zinc-100">
                                    <Button
                                        variant="outline"
                                        onClick={onCancelEdit}
                                        className="rounded-full"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={onSave}
                                        disabled={isSaving}
                                        className="bg-zinc-900 hover:bg-zinc-800 rounded-full"
                                    >
                                        {isSaving && <span className="h-4 w-4 mr-2 animate-spin border-2 border-white border-t-transparent rounded-full inline-block" />}
                                        Save Variables
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Import .env Dialog */}
            <Dialog open={showEnvImport} onOpenChange={setShowEnvImport}>
                <DialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden rounded-2xl">
                    <DialogHeader className="px-6 pt-6 pb-4">
                        <DialogTitle className="text-xl font-semibold text-zinc-900">
                            Import Environment Variables
                        </DialogTitle>
                        <p className="text-sm text-zinc-500 mt-2">
                            Paste your .env file contents below or upload a file.
                        </p>
                    </DialogHeader>

                    <div className="px-6 pb-6 space-y-4">
                        {/* File Upload */}
                        <div>
                            <input
                                type="file"
                                accept=".env,.env.local,.env.example,.env.development,.env.production,text/plain"
                                onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) {
                                        const reader = new FileReader()
                                        reader.onload = (event) => {
                                            setEnvImportText(event.target?.result as string || "")
                                        }
                                        reader.readAsText(file)
                                    }
                                }}
                                className="hidden"
                                id="env-file-input"
                            />
                            <label
                                htmlFor="env-file-input"
                                className="flex items-center justify-center gap-2 w-full h-20 border-2 border-dashed border-zinc-200 rounded-xl cursor-pointer hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
                            >
                                <FileText className="h-5 w-5 text-zinc-400" />
                                <span className="text-sm text-zinc-500">
                                    Click to upload .env file
                                </span>
                            </label>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex-1 h-px bg-zinc-200" />
                            <span className="text-xs text-zinc-400">or paste below</span>
                            <div className="flex-1 h-px bg-zinc-200" />
                        </div>

                        {/* Textarea for pasting */}
                        <textarea
                            value={envImportText}
                            onChange={(e) => setEnvImportText(e.target.value)}
                            placeholder={"DATABASE_URL=postgres://...\nAPI_KEY=sk-...\n# Comments are ignored"}
                            className="w-full h-48 px-4 py-3 border border-zinc-200 rounded-xl text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:border-zinc-400 transition-all"
                        />

                        <p className="text-xs text-zinc-500">
                            Lines starting with # are ignored. Supports KEY=value and KEY=&quot;value&quot; formats.
                        </p>
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowEnvImport(false)
                                setEnvImportText("")
                            }}
                            className="rounded-full"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={parseAndImportEnv}
                            disabled={!envImportText.trim()}
                            className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-full px-6 disabled:bg-zinc-200 disabled:text-zinc-400"
                        >
                            Import {envImportText.trim() ? `(${envImportText.split("\n").filter(l => l.trim() && !l.trim().startsWith("#") && l.includes("=")).length} vars)` : ""}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}

/** Security note component for environment variables */
export function EnvironmentVariablesSecurityNote() {
    return (
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 h-full flex flex-col justify-center">
            <div className="flex flex-col items-center text-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                    <Settings2 className="h-6 w-6 text-emerald-600" />
                </div>
                <div>
                    <h4 className="font-semibold text-zinc-900 mb-2">Encrypted & Secure</h4>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                        All environment variables are encrypted at rest and in transit. They are never exposed in build logs or the client-side bundle.
                    </p>
                </div>
            </div>
        </div>
    )
}
