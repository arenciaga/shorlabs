"use client"

import { useState, useCallback } from "react"
import { Loader2 } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { PG_COLUMN_TYPES, isValidIdentifier } from "./types"

interface AddColumnDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    tableName: string
    onSubmit: (column: {
        name: string
        type: string
        nullable: boolean
        default: string | null
    }) => Promise<void>
}

export function AddColumnDialog({ open, onOpenChange, tableName, onSubmit }: AddColumnDialogProps) {
    const [name, setName] = useState("")
    const [type, setType] = useState("text")
    const [nullable, setNullable] = useState(true)
    const [defaultValue, setDefaultValue] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reset = useCallback(() => {
        setName("")
        setType("text")
        setNullable(true)
        setDefaultValue("")
        setError(null)
        setSubmitting(false)
    }, [])

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) reset()
        onOpenChange(nextOpen)
    }

    const nameValid = name.length > 0 && isValidIdentifier(name)
    const canSubmit = nameValid && type.length > 0 && !submitting

    const handleSubmit = async () => {
        if (!canSubmit) return
        setError(null)
        setSubmitting(true)
        try {
            await onSubmit({
                name,
                type,
                nullable,
                default: defaultValue.trim() || null,
            })
            handleOpenChange(false)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to add column")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Add Column</DialogTitle>
                    <DialogDescription>
                        Add a new column to <span className="font-mono font-medium">{tableName}</span>.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="col-name">Column Name</Label>
                        <Input
                            id="col-name"
                            placeholder="e.g. email, created_at"
                            value={name}
                            onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                            className="font-mono text-base sm:text-sm h-10 sm:h-9"
                            autoFocus
                        />
                        {name.length > 0 && !nameValid && (
                            <p className="text-xs text-red-500">
                                Must start with a letter or underscore, and contain only letters, numbers, underscores.
                            </p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label>Data Type</Label>
                        <Select value={type} onValueChange={setType}>
                            <SelectTrigger className="font-mono text-base sm:text-sm h-10 sm:h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PG_COLUMN_TYPES.map(t => (
                                    <SelectItem key={t.value} value={t.value} className="text-sm font-mono">
                                        {t.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="col-nullable"
                            checked={nullable}
                            onCheckedChange={v => setNullable(!!v)}
                        />
                        <Label htmlFor="col-nullable" className="text-sm font-normal cursor-pointer">
                            Allow NULL values
                        </Label>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="col-default">Default Value</Label>
                        <Input
                            id="col-default"
                            placeholder="e.g. gen_random_uuid(), 0, 'hello'"
                            value={defaultValue}
                            onChange={e => setDefaultValue(e.target.value)}
                            className="font-mono text-base sm:text-sm h-10 sm:h-9"
                        />
                        <p className="text-xs text-zinc-500">Leave empty for no default.</p>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit}>
                        {submitting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Adding...
                            </>
                        ) : (
                            "Add Column"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
