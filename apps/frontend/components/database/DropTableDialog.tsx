"use client"

import { useState, useCallback } from "react"
import { Loader2, AlertTriangle } from "lucide-react"
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface DropTableDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    tableName: string
    onConfirm: () => Promise<void>
}

export function DropTableDialog({ open, onOpenChange, tableName, onConfirm }: DropTableDialogProps) {
    const [confirmText, setConfirmText] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reset = useCallback(() => {
        setConfirmText("")
        setError(null)
        setSubmitting(false)
    }, [])

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) reset()
        onOpenChange(nextOpen)
    }

    const canConfirm = confirmText === tableName && !submitting

    const handleConfirm = async () => {
        if (!canConfirm) return
        setError(null)
        setSubmitting(true)
        try {
            await onConfirm()
            handleOpenChange(false)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to drop table")
            setSubmitting(false)
        }
    }

    return (
        <AlertDialog open={open} onOpenChange={handleOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                        Drop Table
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        This will permanently delete the table{" "}
                        <span className="font-mono font-semibold text-zinc-900">{tableName}</span>{" "}
                        and all its data. This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2">
                    <Label htmlFor="confirm-drop" className="text-sm">
                        Type <span className="font-mono font-semibold text-zinc-900">{tableName}</span> to confirm:
                    </Label>
                    <Input
                        id="confirm-drop"
                        placeholder={tableName}
                        value={confirmText}
                        onChange={e => setConfirmText(e.target.value)}
                        className="font-mono text-base sm:text-sm h-10 sm:h-9"
                        autoFocus
                    />
                </div>
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                        {error}
                    </div>
                )}
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
                    <Button
                        variant="destructive"
                        onClick={handleConfirm}
                        disabled={!canConfirm}
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Dropping...
                            </>
                        ) : (
                            "Drop Table"
                        )}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
