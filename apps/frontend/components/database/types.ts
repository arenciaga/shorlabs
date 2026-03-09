export const PG_COLUMN_TYPES = [
    { value: "uuid", label: "uuid" },
    { value: "text", label: "text" },
    { value: "varchar(255)", label: "varchar(255)" },
    { value: "integer", label: "integer" },
    { value: "bigint", label: "bigint" },
    { value: "smallint", label: "smallint" },
    { value: "serial", label: "serial" },
    { value: "bigserial", label: "bigserial" },
    { value: "boolean", label: "boolean" },
    { value: "timestamp with time zone", label: "timestamptz" },
    { value: "timestamp without time zone", label: "timestamp" },
    { value: "date", label: "date" },
    { value: "time", label: "time" },
    { value: "real", label: "real" },
    { value: "double precision", label: "double precision" },
    { value: "numeric", label: "numeric" },
    { value: "jsonb", label: "jsonb" },
    { value: "json", label: "json" },
    { value: "bytea", label: "bytea" },
    { value: "inet", label: "inet" },
    { value: "interval", label: "interval" },
] as const

export interface ColumnDraft {
    id: string
    name: string
    type: string
    nullable: boolean
    defaultValue: string
    isPrimaryKey: boolean
}

export function createDefaultColumn(): ColumnDraft {
    return {
        id: crypto.randomUUID(),
        name: "",
        type: "text",
        nullable: true,
        defaultValue: "",
        isPrimaryKey: false,
    }
}

export function createIdColumn(): ColumnDraft {
    return {
        id: crypto.randomUUID(),
        name: "id",
        type: "uuid",
        nullable: false,
        defaultValue: "gen_random_uuid()",
        isPrimaryKey: true,
    }
}

export const PG_IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/

export function isValidIdentifier(name: string): boolean {
    return PG_IDENTIFIER_RE.test(name)
}
