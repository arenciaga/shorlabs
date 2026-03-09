"use client"

import { useState, useCallback, useEffect } from "react"
import { Loader2, AlertTriangle } from "lucide-react"
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
import type { ColumnInfo } from "@/lib/api"

interface EditColumnDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    tableName: string
    column: ColumnInfo | null
    onSubmit: (columnName: string, changes: {
        type?: string
        nullable?: boolean
        default?: string | null
        new_name?: string
    }) => Promise<void>
}

export function EditColumnDialog({ open, onOpenChange, tableName, column, onSubmit }: EditColumnDialogProps) {
    const [newName, setNewName] = useState("")
    const [type, setType] = useState("")
    const [nullable, setNullable] = useState(true)
    const [defaultValue, setDefaultValue] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Populate form when column changes
    useEffect(() => {
        if (column) {
            setNewName(column.column_name)
            setType(column.data_type)
            setNullable(column.is_nullable === "YES")
            setDefaultValue(column.column_default || "")
            setError(null)
        }
    }, [column])

    const reset = useCallback(() => {
        setError(null)
        setSubmitting(false)
    }, [])

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) reset()
        onOpenChange(nextOpen)
    }

    if (!column) return null

    const nameChanged = newName !== column.column_name
    const typeChanged = type !== column.data_type
    const nullableChanged = nullable !== (column.is_nullable === "YES")
    const defaultChanged = defaultValue !== (column.column_default || "")
    const hasChanges = nameChanged || typeChanged || nullableChanged || defaultChanged

    const nameValid = newName.length > 0 && isValidIdentifier(newName)
    const canSubmit = hasChanges && nameValid && !submitting

    const handleSubmit = async () => {
        if (!canSubmit) return
        setError(null)
        setSubmitting(true)
        try {
            const changes: Record<string, unknown> = {}
            if (typeChanged) changes.type = type
            if (nullableChanged) changes.nullable = nullable
            if (defaultChanged) changes.default = defaultValue.trim() || null
            if (nameChanged) changes.new_name = newName

            await onSubmit(column.column_name, changes as {
                type?: string
                nullable?: boolean
                default?: string | null
                new_name?: string
            })
            handleOpenChange(false)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to alter column")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit Column</DialogTitle>
                    <DialogDescription>
                        Modify <span className="font-mono font-medium">{column.column_name}</span> in{" "}
                        <span className="font-mono font-medium">{tableName}</span>.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="edit-col-name">Column Name</Label>
                        <Input
                            id="edit-col-name"
                            value={newName}
                            onChange={e => setNewName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                            className="font-mono text-base sm:text-sm h-10 sm:h-9"
                        />
                        {newName.length > 0 && !nameValid && (
                            <p className="text-xs text-red-500">Invalid identifier name.</p>
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
                        {typeChanged && (
                            <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                <span>Changing column type may cause data loss if existing data is incompatible with the new type.</span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="edit-col-nullable"
                            checked={nullable}
                            onCheckedChange={v => setNullable(!!v)}
                        />
                        <Label htmlFor="edit-col-nullable" className="text-sm font-normal cursor-pointer">
                            Allow NULL values
                        </Label>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="edit-col-default">Default Value</Label>
                        <Input
                            id="edit-col-default"
                            placeholder="e.g. gen_random_uuid(), 0, 'hello'"
                            value={defaultValue}
                            onChange={e => setDefaultValue(e.target.value)}
                            className="font-mono text-base sm:text-sm h-10 sm:h-9"
                        />
                        <p className="text-xs text-zinc-500">Leave empty to remove default.</p>
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
                                Saving...
                            </>
                        ) : (
                            "Save Changes"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
