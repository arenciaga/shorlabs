"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@clerk/nextjs"
import {
    Database,
    Loader2,
    Table2,
    ChevronLeft,
    ChevronRight,
    Key,
    RefreshCw,
    AlertCircle,
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
    fetchDatabaseSchemas,
    fetchDatabaseTables,
    fetchTableColumns,
    fetchTableData,
    SchemaInfo,
    TableInfo,
    ColumnInfo,
    TableData,
} from "@/lib/api"

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

    // Loading / error
    const [loadingSchemas, setLoadingSchemas] = useState(false)
    const [loadingTables, setLoadingTables] = useState(false)
    const [loadingColumns, setLoadingColumns] = useState(false)
    const [loadingData, setLoadingData] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Results
    const [columns, setColumns] = useState<ColumnInfo[]>([])
    const [tableData, setTableData] = useState<TableData | null>(null)
    const [currentPage, setCurrentPage] = useState(1)

    const loadSchemas = useCallback(async () => {
        if (!orgId) return
        setLoadingSchemas(true)
        setError(null)
        try {
            const token = await getToken()
            if (!token) return
            const result = await fetchDatabaseSchemas(token, projectId, orgId)
            setSchemas(result.schemas)
            if (result.schemas.length > 0) {
                const hasPublic = result.schemas.some(s => s.schema_name === "public")
                if (!hasPublic) {
                    setSelectedSchema(result.schemas[0].schema_name)
                }
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load schemas")
        } finally {
            setLoadingSchemas(false)
        }
    }, [getToken, projectId, orgId])

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

    // Load schemas on mount
    useEffect(() => {
        if (projectStatus === "LIVE") {
            loadSchemas()
        }
    }, [projectStatus, loadSchemas])

    // Load tables when schema changes
    useEffect(() => {
        if (projectStatus === "LIVE" && selectedSchema) {
            loadTables(selectedSchema)
            setSelectedTable(null)
            setColumns([])
            setTableData(null)
        }
    }, [projectStatus, selectedSchema, loadTables])

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

    if (projectStatus !== "LIVE") {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
                <Database className="h-10 w-10 mb-3" />
                <p className="text-sm">Database is not available yet</p>
                <p className="text-xs mt-1">Wait for provisioning to complete</p>
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
                                <button
                                    onClick={() => loadTables(selectedSchema)}
                                    className="p-1 hover:bg-zinc-200 rounded transition-colors"
                                    title="Refresh tables"
                                >
                                    <RefreshCw className="h-3 w-3 text-zinc-400" />
                                </button>
                            </div>
                        </div>
                        {loadingTables ? (
                            <div className="flex items-center gap-2 text-sm text-zinc-400 px-3 py-2">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Loading...
                            </div>
                        ) : tables.length === 0 ? (
                            <div className="px-3 py-4 text-center">
                                <p className="text-sm text-zinc-400">No tables in this schema</p>
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
                        <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 py-12 md:py-0">
                            <Database className="h-10 w-10 mb-3" />
                            <p className="text-sm">Select a table to explore</p>
                        </div>
                    ) : (
                        <>
                            {/* Table header + sub-tabs */}
                            <div className="border-b border-zinc-200 px-3 sm:px-4 pt-3">
                                <div className="flex items-center gap-2 mb-3">
                                    <Table2 className="h-4 w-4 text-zinc-400 shrink-0" />
                                    <h3 className="font-semibold text-zinc-900 text-sm font-mono truncate">{selectedTable}</h3>
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
                                    <StructureView columns={columns} loading={loadingColumns} />
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
        </div>
    )
}

function StructureView({ columns, loading }: { columns: ColumnInfo[]; loading: boolean }) {
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
        <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: "480px" }}>
                <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50">
                        <th className="text-left px-3 sm:px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">Name</th>
                        <th className="text-left px-3 sm:px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">Type</th>
                        <th className="text-left px-3 sm:px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">Nullable</th>
                        <th className="text-left px-3 sm:px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">Default</th>
                        <th className="text-center px-3 sm:px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">PK</th>
                    </tr>
                </thead>
                <tbody>
                    {columns.map((col) => (
                        <tr key={col.column_name} className="border-b border-zinc-100 hover:bg-zinc-50/50">
                            <td className="px-3 sm:px-4 py-2 font-mono text-xs text-zinc-900 whitespace-nowrap">{col.column_name}</td>
                            <td className="px-3 sm:px-4 py-2 font-mono text-xs text-zinc-600 whitespace-nowrap">
                                {col.data_type}
                                {col.character_maximum_length ? `(${col.character_maximum_length})` : ""}
                            </td>
                            <td className="px-3 sm:px-4 py-2 text-xs text-zinc-500">
                                {col.is_nullable === "YES" ? "Yes" : "No"}
                            </td>
                            <td className="px-3 sm:px-4 py-2 font-mono text-xs text-zinc-500 max-w-48 truncate">
                                {col.column_default || "—"}
                            </td>
                            <td className="px-3 sm:px-4 py-2 text-center">
                                {col.is_primary_key && (
                                    <Key className="h-3.5 w-3.5 text-amber-500 inline-block" />
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
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
