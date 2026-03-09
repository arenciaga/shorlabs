"use client"

import { useState, useCallback } from "react"
import { Plus, Trash2, Loader2 } from "lucide-react"
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
import {
    PG_COLUMN_TYPES,
    createDefaultColumn,
    createIdColumn,
    isValidIdentifier,
    type ColumnDraft,
} from "./types"

interface CreateTableDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSubmit: (tableName: string, columns: ColumnDraft[]) => Promise<void>
}

export function CreateTableDialog({ open, onOpenChange, onSubmit }: CreateTableDialogProps) {
    const [tableName, setTableName] = useState("")
    const [columns, setColumns] = useState<ColumnDraft[]>([createIdColumn()])
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reset = useCallback(() => {
        setTableName("")
        setColumns([createIdColumn()])
        setError(null)
        setSubmitting(false)
    }, [])

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) reset()
        onOpenChange(nextOpen)
    }

    const addColumn = () => {
        setColumns(prev => [...prev, createDefaultColumn()])
    }

    const removeColumn = (id: string) => {
        setColumns(prev => prev.filter(c => c.id !== id))
    }

    const updateColumn = (id: string, field: keyof ColumnDraft, value: string | boolean) => {
        setColumns(prev =>
            prev.map(c => (c.id === id ? { ...c, [field]: value } : c))
        )
    }

    const tableNameValid = tableName.length > 0 && isValidIdentifier(tableName)
    const columnsValid = columns.length > 0 && columns.every(c => c.name.length > 0 && isValidIdentifier(c.name) && c.type.length > 0)
    const hasDuplicateNames = new Set(columns.map(c => c.name.toLowerCase())).size !== columns.length
    const canSubmit = tableNameValid && columnsValid && !hasDuplicateNames && !submitting

    const handleSubmit = async () => {
        if (!canSubmit) return
        setError(null)
        setSubmitting(true)
        try {
            await onSubmit(tableName, columns)
            handleOpenChange(false)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to create table")
        } finally {
            setSubmitting(false)
        }
    }

    // Build SQL preview
    const sqlPreview = buildSqlPreview(tableName, columns)

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>Create New Table</DialogTitle>
                    <DialogDescription>
                        Define the table name and columns for your new database table.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-6 py-4">
                    {/* Table Name */}
                    <div className="space-y-2">
                        <Label htmlFor="table-name">Table Name</Label>
                        <Input
                            id="table-name"
                            placeholder="e.g. users, products, orders"
                            value={tableName}
                            onChange={e => setTableName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                            className="font-mono text-base sm:text-sm h-10 sm:h-9"
                            autoFocus
                        />
                        {tableName.length > 0 && !tableNameValid && (
                            <p className="text-xs text-red-500">
                                Must start with a letter or underscore, contain only letters, numbers, and underscores.
                            </p>
                        )}
                    </div>

                    {/* Columns */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label>Columns</Label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={addColumn}
                                className="h-8 sm:h-7 text-xs"
                            >
                                <Plus className="h-3 w-3 mr-1" />
                                Add Column
                            </Button>
                        </div>

                        {hasDuplicateNames && (
                            <p className="text-xs text-red-500">Column names must be unique.</p>
                        )}

                        {/* Column Header — hidden on mobile, shown sm+ */}
                        <div className="hidden sm:grid grid-cols-[1fr_140px_60px_60px_36px] gap-2 px-1">
                            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Name</span>
                            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Type</span>
                            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider text-center">Nullable</span>
                            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider text-center">PK</span>
                            <span />
                        </div>

                        {/* Column Rows */}
                        <div className="space-y-3 sm:space-y-2">
                            {columns.map((col) => (
                                <div key={col.id}>
                                    {/* Mobile: stacked card layout */}
                                    <div className="sm:hidden border border-zinc-200 rounded-lg p-3 space-y-3 bg-white">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                                                Column {columns.indexOf(col) + 1}
                                            </span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removeColumn(col.id)}
                                                disabled={columns.length <= 1}
                                                className="h-8 w-8 p-0 text-zinc-400 hover:text-red-500"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs text-zinc-500">Name</Label>
                                            <Input
                                                placeholder="column_name"
                                                value={col.name}
                                                onChange={e =>
                                                    updateColumn(col.id, "name", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                                                }
                                                className="font-mono text-base sm:text-xs h-10 sm:h-8"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs text-zinc-500">Type</Label>
                                            <Select
                                                value={col.type}
                                                onValueChange={v => updateColumn(col.id, "type", v)}
                                            >
                                                <SelectTrigger className="h-10 sm:h-8 text-base sm:text-xs font-mono">
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
                                        <div className="space-y-1.5">
                                            <Label className="text-xs text-zinc-500">Default Value</Label>
                                            <Input
                                                placeholder="e.g. gen_random_uuid(), 0"
                                                value={col.defaultValue}
                                                onChange={e => updateColumn(col.id, "defaultValue", e.target.value)}
                                                className="font-mono text-base sm:text-xs h-10 sm:h-8"
                                            />
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <Checkbox
                                                    checked={col.nullable}
                                                    onCheckedChange={v => updateColumn(col.id, "nullable", !!v)}
                                                />
                                                <span className="text-xs text-zinc-600">Nullable</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <Checkbox
                                                    checked={col.isPrimaryKey}
                                                    onCheckedChange={v => updateColumn(col.id, "isPrimaryKey", !!v)}
                                                />
                                                <span className="text-xs text-zinc-600">Primary Key</span>
                                            </label>
                                        </div>
                                    </div>

                                    {/* Desktop: grid row layout */}
                                    <div className="hidden sm:grid grid-cols-[1fr_140px_60px_60px_36px] gap-2 items-center">
                                        <Input
                                            placeholder="column_name"
                                            value={col.name}
                                            onChange={e =>
                                                updateColumn(col.id, "name", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                                            }
                                            className="font-mono text-xs h-8"
                                        />
                                        <Select
                                            value={col.type}
                                            onValueChange={v => updateColumn(col.id, "type", v)}
                                        >
                                            <SelectTrigger className="h-8 text-xs font-mono">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {PG_COLUMN_TYPES.map(t => (
                                                    <SelectItem key={t.value} value={t.value} className="text-xs font-mono">
                                                        {t.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <div className="flex justify-center">
                                            <Checkbox
                                                checked={col.nullable}
                                                onCheckedChange={v => updateColumn(col.id, "nullable", !!v)}
                                            />
                                        </div>
                                        <div className="flex justify-center">
                                            <Checkbox
                                                checked={col.isPrimaryKey}
                                                onCheckedChange={v => updateColumn(col.id, "isPrimaryKey", !!v)}
                                            />
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removeColumn(col.id)}
                                            disabled={columns.length <= 1}
                                            className="h-8 w-8 p-0 text-zinc-400 hover:text-red-500"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Default value inputs — desktop only (mobile has defaults inline in cards) */}
                        {columns.some(c => c.name.length > 0) && (
                            <div className="hidden sm:block space-y-2 pt-2 border-t border-zinc-100">
                                <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                                    Default Values (optional)
                                </span>
                                {columns.filter(c => c.name.length > 0).map(col => (
                                    <div key={col.id} className="flex items-center gap-2">
                                        <span className="text-xs font-mono text-zinc-500 w-32 truncate shrink-0">
                                            {col.name}
                                        </span>
                                        <Input
                                            placeholder="e.g. gen_random_uuid(), 0, 'default'"
                                            value={col.defaultValue}
                                            onChange={e => updateColumn(col.id, "defaultValue", e.target.value)}
                                            className="font-mono text-xs h-7 flex-1"
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* SQL Preview */}
                    {tableNameValid && columnsValid && (
                        <div className="space-y-2">
                            <Label className="text-zinc-500">SQL Preview</Label>
                            <pre className="bg-zinc-50 border border-zinc-200 rounded p-3 text-xs font-mono text-zinc-700 overflow-x-auto whitespace-pre-wrap">
                                {sqlPreview}
                            </pre>
                        </div>
                    )}

                    {/* Error */}
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
                                Creating...
                            </>
                        ) : (
                            "Create Table"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function buildSqlPreview(tableName: string, columns: ColumnDraft[]): string {
    if (!tableName || columns.length === 0) return ""

    const colDefs = columns
        .filter(c => c.name.length > 0)
        .map(c => {
            const parts = [`  "${c.name}" ${c.type}`]
            if (!c.nullable) parts.push("NOT NULL")
            if (c.defaultValue.trim()) parts.push(`DEFAULT ${c.defaultValue.trim()}`)
            return parts.join(" ")
        })

    const pkCols = columns.filter(c => c.isPrimaryKey && c.name.length > 0)
    if (pkCols.length > 0) {
        colDefs.push(`  PRIMARY KEY (${pkCols.map(c => `"${c.name}"`).join(", ")})`)
    }

    return `CREATE TABLE "public"."${tableName}" (\n${colDefs.join(",\n")}\n);`
}
