import { useState, type ReactNode } from "react"
import { Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface DeleteProjectDialogProps {
    projectName: string
    deleting: boolean
    open: boolean
    onOpenChange: (open: boolean) => void
    onDelete: () => void
    /** Label for the button and dialog, e.g. "Delete Project" or "Delete Database" */
    entityLabel?: string
    /** Description text for the dialog */
    description?: ReactNode
}

export function DeleteProjectDialog({
    projectName,
    deleting,
    open,
    onOpenChange,
    onDelete,
    entityLabel = "Delete Project",
    description,
}: DeleteProjectDialogProps) {
    const [confirmProjectName, setConfirmProjectName] = useState("")
    const [confirmPhrase, setConfirmPhrase] = useState("")

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            setConfirmProjectName("")
            setConfirmPhrase("")
        }
        onOpenChange(newOpen)
    }

    return (
        <AlertDialog open={open} onOpenChange={handleOpenChange}>
            <AlertDialogTrigger asChild>
                <Button
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50 rounded-full"
                >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {entityLabel}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-md rounded-none">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-xl">{entityLabel}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {description || (
                            <>This will permanently delete <strong>{projectName}</strong> and all its deployments.</>
                        )}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-4 py-4">
                    <div>
                        <label className="text-sm text-zinc-600 block mb-2">
                            Type <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-800">{projectName}</code> to confirm
                        </label>
                        <Input
                            value={confirmProjectName}
                            onChange={(e) => setConfirmProjectName(e.target.value)}
                            placeholder={projectName}
                            className="font-mono"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-600 block mb-2">
                            Type <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-800">delete my project</code> to confirm
                        </label>
                        <Input
                            value={confirmPhrase}
                            onChange={(e) => setConfirmPhrase(e.target.value)}
                            placeholder="delete my project"
                        />
                    </div>
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onDelete}
                        disabled={deleting || confirmProjectName !== projectName || confirmPhrase !== "delete my project"}
                        className="bg-red-600 hover:bg-red-700 rounded-full"
                    >
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {entityLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
