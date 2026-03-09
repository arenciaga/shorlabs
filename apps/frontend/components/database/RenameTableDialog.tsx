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
import { isValidIdentifier } from "./types"

interface RenameTableDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    currentName: string
    onSubmit: (newName: string) => Promise<void>
}

export function RenameTableDialog({ open, onOpenChange, currentName, onSubmit }: RenameTableDialogProps) {
    const [newName, setNewName] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reset = useCallback(() => {
        setNewName("")
        setError(null)
        setSubmitting(false)
    }, [])

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) reset()
        onOpenChange(nextOpen)
    }

    const nameValid = newName.length > 0 && isValidIdentifier(newName)
    const nameChanged = newName !== currentName
    const canSubmit = nameValid && nameChanged && !submitting

    const handleSubmit = async () => {
        if (!canSubmit) return
        setError(null)
        setSubmitting(true)
        try {
            await onSubmit(newName)
            handleOpenChange(false)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to rename table")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Rename Table</DialogTitle>
                    <DialogDescription>
                        Rename <span className="font-mono font-medium">{currentName}</span> to a new name.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="new-table-name">New Table Name</Label>
                        <Input
                            id="new-table-name"
                            placeholder={currentName}
                            value={newName}
                            onChange={e => setNewName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                            className="font-mono text-base sm:text-sm h-10 sm:h-9"
                            autoFocus
                        />
                        {newName.length > 0 && !nameValid && (
                            <p className="text-xs text-red-500">
                                Must start with a letter or underscore, and contain only letters, numbers, underscores.
                            </p>
                        )}
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
                                Renaming...
                            </>
                        ) : (
                            "Rename Table"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
