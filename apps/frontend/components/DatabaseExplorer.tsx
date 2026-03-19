"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "@clerk/nextjs"
import { toast } from "sonner"
import {
    Database,
    Loader2,
    Table2,
    ChevronLeft,
    ChevronRight,
    Key,
    RefreshCw,
    AlertCircle,
    Plus,
    MoreHorizontal,
    Pencil,
    Trash2,
    Type,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import {
    fetchDatabaseSchemas,
    fetchDatabaseTables,
    fetchTableColumns,
    fetchTableData,
    createDatabaseTable,
    dropDatabaseTable,
    renameDatabaseTable,
    addDatabaseColumn,
    alterDatabaseColumn,
    dropDatabaseColumn,
    SchemaInfo,
    TableInfo,
    ColumnInfo,
    TableData,
} from "@/lib/api"
import { CreateTableDialog } from "@/components/database/CreateTableDialog"
import { AddColumnDialog } from "@/components/database/AddColumnDialog"
import { EditColumnDialog } from "@/components/database/EditColumnDialog"
import { DropTableDialog } from "@/components/database/DropTableDialog"
import { RenameTableDialog } from "@/components/database/RenameTableDialog"
import type { ColumnDraft } from "@/components/database/types"

interface DatabaseExplorerProps {
    projectId: string
    orgId: string | null
    projectStatus: string
}

export function DatabaseExplorer({ projectId, orgId, projectStatus }: DatabaseExplorerProps) {
    const { getToken } = useAuth()

    // Schema / table navigation
    const [schemas, setSchemas] = useState<SchemaInfo[]>([])
    const [selectedSchema, setSelectedSchema] = useState<string>("public")
    const [tables, setTables] = useState<TableInfo[]>([])
    const [selectedTable, setSelectedTable] = useState<string | null>(null)
    const [tableView, setTableView] = useState<"structure" | "data">("structure")

    // Initial load gate — hides all UI until first successful schema+table load
    const [initialLoaded, setInitialLoaded] = useState(false)

    const [initialLoadError, setInitialLoadError] = useState<string | null>(null)
    const retryCountRef = useRef(0)
    const maxRetries = 3
    const mountedRef = useRef(true)

    // Loading / error
    const [loadingSchemas] = useState(false)
    const [loadingTables, setLoadingTables] = useState(false)
    const [loadingColumns, setLoadingColumns] = useState(false)
    const [loadingData, setLoadingData] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Results
    const [columns, setColumns] = useState<ColumnInfo[]>([])
    const [tableData, setTableData] = useState<TableData | null>(null)
    const [currentPage, setCurrentPage] = useState(1)

    // Dialog states
    const [createTableOpen, setCreateTableOpen] = useState(false)
    const [dropTableOpen, setDropTableOpen] = useState(false)
    const [renameTableOpen, setRenameTableOpen] = useState(false)
    const [addColumnOpen, setAddColumnOpen] = useState(false)
    const [editColumnOpen, setEditColumnOpen] = useState(false)
    const [dropColumnConfirmOpen, setDropColumnConfirmOpen] = useState(false)
    const [editingColumn, setEditingColumn] = useState<ColumnInfo | null>(null)
    const [droppingColumn, setDroppingColumn] = useState<string | null>(null)
    const [droppingColumnLoading, setDroppingColumnLoading] = useState(false)



    const loadTables = useCallback(async (schema: string) => {
        if (!orgId) return
        setLoadingTables(true)
        setError(null)
        try {
            const token = await getToken()
            if (!token) return
            const result = await fetchDatabaseTables(token, projectId, orgId, schema)
            setTables(result.tables)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load tables")
        } finally {
            setLoadingTables(false)
        }
    }, [getToken, projectId, orgId])

    const loadColumns = useCallback(async (tableName: string, schema: string) => {
        if (!orgId) return
        setLoadingColumns(true)
        try {
            const token = await getToken()
            if (!token) return
            const result = await fetchTableColumns(token, projectId, orgId, tableName, schema)
            setColumns(result.columns)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load columns")
        } finally {
            setLoadingColumns(false)
        }
    }, [getToken, projectId, orgId])

    const loadData = useCallback(async (tableName: string, schema: string, page: number) => {
        if (!orgId) return
        setLoadingData(true)
        try {
            const token = await getToken()
            if (!token) return
            const result = await fetchTableData(token, projectId, orgId, tableName, schema, page)
            setTableData(result)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load data")
        } finally {
            setLoadingData(false)
        }
    }, [getToken, projectId, orgId])

    // Initial load with retry — fetches schemas + tables in one go
    const performInitialLoad = useCallback(async () => {
        if (!orgId) return

        setInitialLoadError(null)

        const attempt = async (): Promise<boolean> => {
            try {
                const token = await getToken()
                if (!token || !mountedRef.current) return false

                const schemaResult = await fetchDatabaseSchemas(token, projectId, orgId)
                if (!mountedRef.current) return false
                setSchemas(schemaResult.schemas)

                let schemaToLoad = "public"
                if (schemaResult.schemas.length > 0) {
                    const hasPublic = schemaResult.schemas.some(s => s.schema_name === "public")
                    if (!hasPublic) {
                        schemaToLoad = schemaResult.schemas[0].schema_name
                        setSelectedSchema(schemaToLoad)
                    }
                }

                const tableResult = await fetchDatabaseTables(token, projectId, orgId, schemaToLoad)
                if (!mountedRef.current) return false
                setTables(tableResult.tables)

                return true
            } catch {
                return false
            }
        }

        for (let i = 0; i < maxRetries; i++) {
            if (!mountedRef.current) return
            const success = await attempt()
            if (success) {
                if (mountedRef.current) {
                    retryCountRef.current = 0
                    setInitialLoaded(true)

                }
                return
            }
            if (i < maxRetries - 1 && mountedRef.current) {
                const delay = 3000 * (i + 1) // 3s, 6s
                await new Promise(r => setTimeout(r, delay))
            }
        }

        if (mountedRef.current) {
            setInitialLoadError("Could not connect to the database. It may be waking up from a cold start.")

        }
    }, [getToken, projectId, orgId])

    // Mount / unmount tracking
    useEffect(() => {
        mountedRef.current = true
        return () => { mountedRef.current = false }
    }, [])

    // Trigger initial load on mount when LIVE
    useEffect(() => {
        if (projectStatus === "LIVE" && !initialLoaded) {
            performInitialLoad()
        }
    }, [projectStatus, initialLoaded, performInitialLoad])

    // Load tables when schema changes (only after initial load)
    useEffect(() => {
        if (projectStatus === "LIVE" && selectedSchema && initialLoaded) {
            loadTables(selectedSchema)
            setSelectedTable(null)
            setColumns([])
            setTableData(null)
        }
    }, [projectStatus, selectedSchema, loadTables, initialLoaded])

    const handleSelectTable = (tableName: string) => {
        setSelectedTable(tableName)
        setTableView("structure")
        setCurrentPage(1)
        setTableData(null)
        loadColumns(tableName, selectedSchema)
    }

    const handleSwitchToData = () => {
        setTableView("data")
        if (selectedTable && !tableData) {
            loadData(selectedTable, selectedSchema, 1)
        }
    }

    const handlePageChange = (page: number) => {
        setCurrentPage(page)
        if (selectedTable) {
            loadData(selectedTable, selectedSchema, page)
        }
    }

    // ── Mutation handlers ──────────────────────────────────────

    const handleCreateTable = async (tableName: string, columnDrafts: ColumnDraft[]) => {
        if (!orgId) return
        const token = await getToken()
        if (!token) return
        await createDatabaseTable(token, projectId, orgId, {
            table_name: tableName,
            columns: columnDrafts.map(c => ({
                name: c.name,
                type: c.type,
                nullable: c.nullable,
                default: c.defaultValue.trim() || null,
                is_primary_key: c.isPrimaryKey,
            })),
        }, selectedSchema)
        toast.success(`Table "${tableName}" created`)
        loadTables(selectedSchema)
    }

    const handleDropTable = async () => {
        if (!orgId || !selectedTable) return
        const token = await getToken()
        if (!token) return
        await dropDatabaseTable(token, projectId, orgId, selectedTable, selectedSchema)
        toast.success(`Table "${selectedTable}" dropped`)
        setSelectedTable(null)
        setColumns([])
        setTableData(null)
        loadTables(selectedSchema)
    }

    const handleRenameTable = async (newName: string) => {
        if (!orgId || !selectedTable) return
        const token = await getToken()
        if (!token) return
        await renameDatabaseTable(token, projectId, orgId, selectedTable, { new_name: newName }, selectedSchema)
        toast.success(`Table renamed to "${newName}"`)
        setSelectedTable(newName)
        loadTables(selectedSchema)
    }

    const handleAddColumn = async (column: { name: string; type: string; nullable: boolean; default: string | null }) => {
        if (!orgId || !selectedTable) return
        const token = await getToken()
        if (!token) return
        await addDatabaseColumn(token, projectId, orgId, selectedTable, column, selectedSchema)
        toast.success(`Column "${column.name}" added`)
        loadColumns(selectedTable, selectedSchema)
    }

    const handleEditColumn = async (columnName: string, changes: { type?: string; nullable?: boolean; default?: string | null; new_name?: string }) => {
        if (!orgId || !selectedTable) return
        const token = await getToken()
        if (!token) return
        await alterDatabaseColumn(token, projectId, orgId, selectedTable, columnName, changes, selectedSchema)
        toast.success(`Column "${columnName}" updated`)
        loadColumns(selectedTable, selectedSchema)
    }

    const handleDropColumn = async () => {
        if (!orgId || !selectedTable || !droppingColumn) return
        setDroppingColumnLoading(true)
        try {
            const token = await getToken()
            if (!token) return
            await dropDatabaseColumn(token, projectId, orgId, selectedTable, droppingColumn, selectedSchema)
            toast.success(`Column "${droppingColumn}" dropped`)
            setDropColumnConfirmOpen(false)
            setDroppingColumn(null)
            loadColumns(selectedTable, selectedSchema)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to drop column")
        } finally {
            setDroppingColumnLoading(false)
        }
    }

    if (projectStatus !== "LIVE") {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
                <Database className="h-10 w-10 mb-3" />
                <p className="text-sm">Database is not available yet</p>
                <p className="text-xs mt-1">Wait for provisioning to complete</p>
            </div>
        )
    }

    // Initial loading gate — show full-panel spinner or error until first load succeeds
    if (!initialLoaded) {
        return (
            <div className="bg-zinc-50 border border-zinc-200 rounded-none overflow-hidden">
                <div className="flex flex-col items-center justify-center py-20 px-6" style={{ minHeight: "500px" }}>
                    {initialLoadError ? (
                        <>
                            <div className="h-12 w-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
                                <AlertCircle className="h-6 w-6 text-red-500" />
                            </div>
                            <p className="text-sm font-medium text-zinc-700 mb-1">Connection failed</p>
                            <p className="text-xs text-zinc-400 text-center max-w-[320px] mb-5">
                                {initialLoadError}
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => performInitialLoad()}
                                className="h-9 text-xs"
                            >
                                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                Retry Connection
                            </Button>
                        </>
                    ) : (
                        <>
                            <Loader2 className="h-8 w-8 animate-spin text-zinc-400 mb-4" />
                            <p className="text-sm font-medium text-zinc-700">Connecting to database...</p>
                        </>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="bg-zinc-50 border border-zinc-200 rounded-none overflow-hidden">
            <div className="flex flex-col md:flex-row" style={{ minHeight: "500px" }}>
                {/* Sidebar — stacks on top on mobile with capped height, full sidebar on md+ */}
                <div className="md:w-56 lg:w-64 border-b md:border-b-0 md:border-r border-zinc-200 flex flex-col shrink-0 max-h-[280px] md:max-h-none">
                    {/* Schema selector */}
                    <div className="p-3 border-b border-zinc-200">
                        <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 block">
                            Schema
                        </label>
                        {loadingSchemas ? (
                            <div className="flex items-center gap-2 text-sm text-zinc-400 py-1">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Loading...
                            </div>
                        ) : schemas.length === 0 ? (
                            <p className="text-sm text-zinc-400">No schemas found</p>
                        ) : (
                            <Select value={selectedSchema} onValueChange={setSelectedSchema}>
                                <SelectTrigger className="w-full h-8 text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {schemas.map(s => (
                                        <SelectItem key={s.schema_name} value={s.schema_name}>
                                            {s.schema_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    {/* Tables list */}
                    <div className="flex-1 overflow-y-auto">
                        <div className="p-3 pb-1">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                                    Tables
                                </span>
                                <div className="flex items-center gap-0.5">
                                    <button
                                        onClick={() => setCreateTableOpen(true)}
                                        disabled={loadingSchemas || loadingTables}
                                        className="p-1.5 sm:p-1 hover:bg-zinc-200 rounded transition-colors disabled:opacity-40 disabled:pointer-events-none"
                                        title="Create table"
                                    >
                                        <Plus className="h-4 w-4 sm:h-3 sm:w-3 text-zinc-400" />
                                    </button>
                                    <button
                                        onClick={() => loadTables(selectedSchema)}
                                        disabled={loadingSchemas || loadingTables}
                                        className="p-1.5 sm:p-1 hover:bg-zinc-200 rounded transition-colors disabled:opacity-40 disabled:pointer-events-none"
                                        title="Refresh tables"
                                    >
                                        <RefreshCw className={`h-4 w-4 sm:h-3 sm:w-3 text-zinc-400 ${loadingTables ? "animate-spin" : ""}`} />
                                    </button>
                                </div>
                            </div>
                        </div>
                        {loadingTables ? (
                            <div className="flex items-center gap-2 text-sm text-zinc-400 px-3 py-2">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Loading...
                            </div>
                        ) : tables.length === 0 ? (
                            <div className="px-4 py-6 flex flex-col items-center text-center">
                                <div className="h-10 w-10 rounded-full bg-zinc-100 flex items-center justify-center mb-3">
                                    <Table2 className="h-5 w-5 text-zinc-400" />
                                </div>
                                <p className="text-sm font-medium text-zinc-700">No tables yet</p>
                                <p className="text-xs text-zinc-400 mt-1 mb-3">Create your first table to get started</p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCreateTableOpen(true)}
                                    className="h-8 text-xs"
                                >
                                    <Plus className="h-3 w-3 mr-1.5" />
                                    Create Table
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-0.5 px-2 pb-3">
                                {tables.map(t => (
                                    <button
                                        key={t.table_name}
                                        onClick={() => handleSelectTable(t.table_name)}
                                        className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors flex items-center gap-2 group ${
                                            selectedTable === t.table_name
                                                ? "bg-zinc-200 text-zinc-900"
                                                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                                        }`}
                                    >
                                        <Table2 className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                                        <span className="truncate flex-1 font-mono text-xs">{t.table_name}</span>
                                        <span className="text-[10px] text-zinc-400 tabular-nums shrink-0">
                                            {t.estimated_row_count}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right content */}
                <div className="flex-1 flex flex-col min-w-0">
                    {error && (
                        <div className="m-3 p-3 bg-red-50 border border-red-200 rounded flex items-center gap-2 text-sm text-red-700">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span className="flex-1">{error}</span>
                            <button
                                onClick={() => setError(null)}
                                className="text-red-400 hover:text-red-600 text-xs"
                            >
                                Dismiss
                            </button>
                        </div>
                    )}

                    {!selectedTable ? (
                        <div className="flex-1 flex flex-col items-center justify-center py-12 md:py-0 px-6">
                            <div className="h-12 w-12 rounded-full bg-zinc-100 flex items-center justify-center mb-4">
                                <Database className="h-6 w-6 text-zinc-400" />
                            </div>
                            {tables.length === 0 ? (
                                <>
                                    <p className="text-sm font-medium text-zinc-700">No tables in this database</p>
                                    <p className="text-xs text-zinc-400 mt-1 mb-4 text-center max-w-[240px]">
                                        Create a table to start storing and exploring your data
                                    </p>
                                    <Button
                                        variant="default"
                                        size="sm"
                                        onClick={() => setCreateTableOpen(true)}
                                        className="h-9 text-xs"
                                    >
                                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                                        Create Table
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <p className="text-sm font-medium text-zinc-700">Select a table</p>
                                    <p className="text-xs text-zinc-400 mt-1">Choose a table from the sidebar to explore</p>
                                </>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Table header + sub-tabs */}
                            <div className="border-b border-zinc-200 px-3 sm:px-4 pt-3">
                                <div className="flex items-center gap-2 mb-3">
                                    <Table2 className="h-4 w-4 text-zinc-400 shrink-0" />
                                    <h3 className="font-semibold text-zinc-900 text-sm font-mono truncate flex-1">{selectedTable}</h3>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="sm" className="h-9 w-9 sm:h-7 sm:w-7 p-0">
                                                <MoreHorizontal className="h-4 w-4 text-zinc-500" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => setRenameTableOpen(true)}>
                                                <Type className="h-4 w-4 mr-2" />
                                                Rename Table
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onClick={() => setDropTableOpen(true)}
                                                className="text-red-600 focus:text-red-600"
                                            >
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Drop Table
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                <div className="flex gap-0">
                                    <button
                                        onClick={() => setTableView("structure")}
                                        className={`px-3 py-2 text-sm font-medium transition-colors relative ${
                                            tableView === "structure"
                                                ? "text-zinc-900"
                                                : "text-zinc-500 hover:text-zinc-700"
                                        }`}
                                    >
                                        Structure
                                        {tableView === "structure" && (
                                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />
                                        )}
                                    </button>
                                    <button
                                        onClick={handleSwitchToData}
                                        className={`px-3 py-2 text-sm font-medium transition-colors relative ${
                                            tableView === "data"
                                                ? "text-zinc-900"
                                                : "text-zinc-500 hover:text-zinc-700"
                                        }`}
                                    >
                                        Data
                                        {tableView === "data" && (
                                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Content area */}
                            <div className="flex-1 overflow-auto">
                                {tableView === "structure" ? (
                                    <StructureView
                                        columns={columns}
                                        loading={loadingColumns}
                                        onAddColumn={() => setAddColumnOpen(true)}
                                        onEditColumn={(col) => { setEditingColumn(col); setEditColumnOpen(true) }}
                                        onDropColumn={(colName) => { setDroppingColumn(colName); setDropColumnConfirmOpen(true) }}
                                    />
                                ) : (
                                    <DataView
                                        tableData={tableData}
                                        loading={loadingData}
                                        currentPage={currentPage}
                                        onPageChange={handlePageChange}
                                    />
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── Dialogs ─────────────────────────────────────── */}
            <CreateTableDialog
                open={createTableOpen}
                onOpenChange={setCreateTableOpen}
                onSubmit={handleCreateTable}
            />

            {selectedTable && (
                <>
                    <DropTableDialog
                        open={dropTableOpen}
                        onOpenChange={setDropTableOpen}
                        tableName={selectedTable}
                        onConfirm={handleDropTable}
                    />
                    <RenameTableDialog
                        open={renameTableOpen}
                        onOpenChange={setRenameTableOpen}
                        currentName={selectedTable}
                        onSubmit={handleRenameTable}
                    />
                    <AddColumnDialog
                        open={addColumnOpen}
                        onOpenChange={setAddColumnOpen}
                        tableName={selectedTable}
                        onSubmit={handleAddColumn}
                    />
                    <EditColumnDialog
                        open={editColumnOpen}
                        onOpenChange={setEditColumnOpen}
                        tableName={selectedTable}
                        column={editingColumn}
                        onSubmit={handleEditColumn}
                    />

                    {/* Drop Column Confirmation */}
                    <AlertDialog open={dropColumnConfirmOpen} onOpenChange={setDropColumnConfirmOpen}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Drop Column</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Are you sure you want to drop the column{" "}
                                    <span className="font-mono font-semibold text-zinc-900">{droppingColumn}</span>?
                                    This will permanently delete the column and all its data.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel disabled={droppingColumnLoading}>Cancel</AlertDialogCancel>
                                <Button
                                    variant="destructive"
                                    onClick={handleDropColumn}
                                    disabled={droppingColumnLoading}
                                >
                                    {droppingColumnLoading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            Dropping...
                                        </>
                                    ) : (
                                        "Drop Column"
                                    )}
                                </Button>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </>
            )}
        </div>
    )
}

function StructureView({
    columns,
    loading,
    onAddColumn,
    onEditColumn,
    onDropColumn,
}: {
    columns: ColumnInfo[]
    loading: boolean
    onAddColumn: () => void
    onEditColumn: (col: ColumnInfo) => void
    onDropColumn: (colName: string) => void
}) {
    if (loading) {
        return (
            <div className="flex items-center justify-center py-12 text-zinc-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-sm">Loading columns...</span>
            </div>
        )
    }

    if (columns.length === 0) {
        return (
            <div className="flex items-center justify-center py-12 text-zinc-400">
                <p className="text-sm">No columns found</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-x-auto">
                {/* Mobile: card layout */}
                <div className="sm:hidden space-y-2 p-3">
                    {columns.map((col) => (
                        <div key={col.column_name} className="border border-zinc-200 rounded-lg p-3 bg-white space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                    {col.is_primary_key && (
                                        <Key className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                    )}
                                    <span className="font-mono text-sm text-zinc-900 font-medium truncate">{col.column_name}</span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={() => onEditColumn(col)}
                                        className="p-2 hover:bg-zinc-100 rounded-md transition-colors"
                                        title="Edit column"
                                    >
                                        <Pencil className="h-3.5 w-3.5 text-zinc-500" />
                                    </button>
                                    <button
                                        onClick={() => onDropColumn(col.column_name)}
                                        className="p-2 hover:bg-red-50 rounded-md transition-colors"
                                        title="Drop column"
                                    >
                                        <Trash2 className="h-3.5 w-3.5 text-zinc-400 hover:text-red-500" />
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                <div>
                                    <span className="text-zinc-400">Type</span>
                                    <p className="font-mono text-zinc-600">
                                        {col.data_type}
                                        {col.character_maximum_length ? `(${col.character_maximum_length})` : ""}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-zinc-400">Nullable</span>
                                    <p className="text-zinc-600">{col.is_nullable === "YES" ? "Yes" : "No"}</p>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-zinc-400">Default</span>
                                    <p className="font-mono text-zinc-600 truncate">{col.column_default || "—"}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Desktop: table layout */}
                <table className="hidden sm:table w-full text-sm" style={{ minWidth: "560px" }}>
                    <thead>
                        <tr className="border-b border-zinc-200 bg-zinc-50">
                            <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">Name</th>
                            <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">Type</th>
                            <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">Nullable</th>
                            <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">Default</th>
                            <th className="text-center px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">PK</th>
                            <th className="text-right px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider w-20">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {columns.map((col) => (
                            <tr key={col.column_name} className="border-b border-zinc-100 hover:bg-zinc-50/50 group">
                                <td className="px-4 py-2 font-mono text-xs text-zinc-900 whitespace-nowrap">{col.column_name}</td>
                                <td className="px-4 py-2 font-mono text-xs text-zinc-600 whitespace-nowrap">
                                    {col.data_type}
                                    {col.character_maximum_length ? `(${col.character_maximum_length})` : ""}
                                </td>
                                <td className="px-4 py-2 text-xs text-zinc-500">
                                    {col.is_nullable === "YES" ? "Yes" : "No"}
                                </td>
                                <td className="px-4 py-2 font-mono text-xs text-zinc-500 max-w-48 truncate">
                                    {col.column_default || "—"}
                                </td>
                                <td className="px-4 py-2 text-center">
                                    {col.is_primary_key && (
                                        <Key className="h-3.5 w-3.5 text-amber-500 inline-block" />
                                    )}
                                </td>
                                <td className="px-4 py-2 text-right">
                                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => onEditColumn(col)}
                                            className="p-1 hover:bg-zinc-200 rounded transition-colors"
                                            title="Edit column"
                                        >
                                            <Pencil className="h-3 w-3 text-zinc-500" />
                                        </button>
                                        <button
                                            onClick={() => onDropColumn(col.column_name)}
                                            className="p-1 hover:bg-red-100 rounded transition-colors"
                                            title="Drop column"
                                        >
                                            <Trash2 className="h-3 w-3 text-zinc-500 hover:text-red-500" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {/* Add Column button */}
            <div className="border-t border-zinc-200 px-3 sm:px-4 py-2.5 sm:py-2 bg-white shrink-0">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onAddColumn}
                    className="h-9 sm:h-7 text-xs"
                >
                    <Plus className="h-3.5 w-3.5 sm:h-3 sm:w-3 mr-1" />
                    Add Column
                </Button>
            </div>
        </div>
    )
}

function DataView({
    tableData,
    loading,
    currentPage,
    onPageChange,
}: {
    tableData: TableData | null
    loading: boolean
    currentPage: number
    onPageChange: (page: number) => void
}) {
    if (loading) {
        return (
            <div className="flex items-center justify-center py-12 text-zinc-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-sm">Loading data...</span>
            </div>
        )
    }

    if (!tableData) {
        return (
            <div className="flex items-center justify-center py-12 text-zinc-400">
                <p className="text-sm">No data loaded</p>
            </div>
        )
    }

    if (tableData.rows.length === 0 && tableData.total_count === 0) {
        return (
            <div className="flex items-center justify-center py-12 text-zinc-400">
                <p className="text-sm">No data in this table</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full">
            {/* Data table */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-zinc-200 bg-zinc-50 sticky top-0">
                            {tableData.columns.map(col => (
                                <th
                                    key={col}
                                    className="text-left px-3 sm:px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap"
                                >
                                    {col}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {tableData.rows.map((row, i) => (
                            <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50/50">
                                {tableData.columns.map(col => (
                                    <td
                                        key={col}
                                        className="px-3 sm:px-4 py-1.5 font-mono text-xs text-zinc-700 whitespace-nowrap max-w-48 sm:max-w-64 truncate"
                                    >
                                        {formatCellValue(row[col])}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="border-t border-zinc-200 px-3 sm:px-4 py-2.5 flex items-center justify-between bg-white shrink-0 gap-2">
                <span className="text-xs text-zinc-500">
                    {tableData.total_count} row{tableData.total_count !== 1 ? "s" : ""} total
                </span>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPageChange(currentPage - 1)}
                        disabled={currentPage <= 1}
                        className="h-7 px-2 text-xs"
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs text-zinc-600 tabular-nums">
                        Page {currentPage} of {tableData.total_pages}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPageChange(currentPage + 1)}
                        disabled={currentPage >= tableData.total_pages}
                        className="h-7 px-2 text-xs"
                    >
                        <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
        </div>
    )
}

function formatCellValue(value: unknown): string {
    if (value === null || value === undefined) return "NULL"
    if (typeof value === "boolean") return value ? "true" : "false"
    if (typeof value === "object") return JSON.stringify(value)
    return String(value)
}
