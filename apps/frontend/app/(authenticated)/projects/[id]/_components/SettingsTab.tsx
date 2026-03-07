import React from "react"
import { StartCommandInput } from "@/components/StartCommandInput"
import { EnvironmentVariablesEditor } from "@/components/EnvironmentVariablesEditor"
import { DeleteProjectDialog } from "./DeleteProjectDialog"
import type { ProjectCompat } from "./types"

interface SettingsTabProps {
    project: ProjectCompat
    // Start command
    editingStartCommand: boolean
    startCommandValue: string
    savingStartCommand: boolean
    onStartCommandChange: (value: string) => void
    onStartEditStartCommand: () => void
    onSaveStartCommand: () => void
    onCancelStartCommand: () => void
    // Env vars
    editingEnvVars: boolean
    envVarsList: { key: string; value: string; visible: boolean }[]
    savingEnvVars: boolean
    onEnvVarsChange: (vars: { key: string; value: string; visible: boolean }[]) => void
    onStartEditEnvVars: () => void
    onSaveEnvVars: () => void
    onCancelEnvVars: () => void
    // Delete
    deleting: boolean
    deleteDialogOpen: boolean
    onDeleteDialogOpenChange: (open: boolean) => void
    onDelete: () => void
    deleteEntityLabel?: string
    deleteDescription?: React.ReactNode
}

export function SettingsTab({
    project,
    editingStartCommand,
    startCommandValue,
    savingStartCommand,
    onStartCommandChange,
    onStartEditStartCommand,
    onSaveStartCommand,
    onCancelStartCommand,
    editingEnvVars,
    envVarsList,
    savingEnvVars,
    onEnvVarsChange,
    onStartEditEnvVars,
    onSaveEnvVars,
    onCancelEnvVars,
    deleting,
    deleteDialogOpen,
    onDeleteDialogOpenChange,
    onDelete,
    deleteEntityLabel,
    deleteDescription,
}: SettingsTabProps) {
    return (
        <div className="space-y-6">
            {/* Start Command */}
            <StartCommandInput
                value={editingStartCommand ? startCommandValue : (project.start_command || "")}
                onChange={onStartCommandChange}
                disabled={!editingStartCommand}
                onStartEdit={onStartEditStartCommand}
                isEditMode={editingStartCommand}
                onSave={onSaveStartCommand}
                onCancel={onCancelStartCommand}
                isSaving={savingStartCommand}
            />

            {/* Environment Variables */}
            <EnvironmentVariablesEditor
                envVars={envVarsList}
                onChange={onEnvVarsChange}
                showImport={true}
                readOnly={!editingEnvVars}
                existingEnvVars={project.env_vars}
                onStartEdit={onStartEditEnvVars}
                isEditing={editingEnvVars}
                onCancelEdit={onCancelEnvVars}
                onSave={onSaveEnvVars}
                isSaving={savingEnvVars}
            />

            {/* Danger Zone */}
            <div className="bg-zinc-50 rounded-none border border-red-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-red-100 bg-red-50">
                    <h3 className="font-semibold text-red-900">Danger Zone</h3>
                </div>
                <div className="p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <p className="font-medium text-zinc-900">Delete this service</p>
                            <p className="text-sm text-zinc-500">Once deleted, this cannot be undone. All deployments will be removed.</p>
                        </div>
                        <DeleteProjectDialog
                            projectName={project.name}
                            deleting={deleting}
                            open={deleteDialogOpen}
                            onOpenChange={onDeleteDialogOpenChange}
                            onDelete={onDelete}
                            entityLabel={deleteEntityLabel || "Delete Service"}
                            description={deleteDescription || <>This will permanently delete <strong>{project.name}</strong> and all its deployments.</>}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
