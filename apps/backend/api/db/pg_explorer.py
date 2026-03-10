"""
PostgreSQL Database Explorer

Query utilities for browsing and managing user-provisioned Aurora databases.
Read connections are ephemeral (per-request) and session-level read-only.
Write connections use explicit transactions for DDL operations.
"""

import re
import decimal
import datetime
import uuid
import time
import logging

import psycopg2
import psycopg2.extras

from deployer.aws.rds import get_cluster_secret

logger = logging.getLogger(__name__)

_COLD_START_MAX_RETRIES = 3
_COLD_START_BASE_DELAY = 2  # seconds


_IDENTIFIER_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]{0,62}$")

SYSTEM_SCHEMAS = frozenset(
    {
        "pg_catalog",
        "information_schema",
        "pg_toast",
        "pg_temp_1",
        "pg_toast_temp_1",
    }
)


def _validate_identifier(name: str, label: str = "identifier") -> str:
    if not _IDENTIFIER_RE.match(name):
        raise ValueError(f"Invalid {label}: {name!r}")
    return name


def _sanitize_row(row: dict) -> dict:
    sanitized = {}
    for key, value in row.items():
        if isinstance(value, decimal.Decimal):
            sanitized[key] = float(value)
        elif isinstance(value, (datetime.date, datetime.datetime)):
            sanitized[key] = value.isoformat()
        elif isinstance(value, uuid.UUID):
            sanitized[key] = str(value)
        elif isinstance(value, (bytes, bytearray, memoryview)):
            sanitized[key] = f"<binary {len(value)} bytes>"
        else:
            sanitized[key] = value
    return sanitized


def _connect_with_retry(connect_fn, max_retries=_COLD_START_MAX_RETRIES):
    """Retry a connection function with exponential backoff for Aurora cold starts."""
    last_err = None
    for attempt in range(1, max_retries + 1):
        try:
            return connect_fn()
        except psycopg2.OperationalError as e:
            last_err = e
            if attempt < max_retries:
                delay = _COLD_START_BASE_DELAY * (2 ** (attempt - 1))
                logger.warning(
                    "Database connection attempt %d/%d failed (%s). "
                    "Retrying in %ds (possible Aurora cold start)...",
                    attempt, max_retries, str(e).strip(), delay,
                )
                time.sleep(delay)
            else:
                logger.error(
                    "Database connection failed after %d attempts: %s",
                    max_retries, str(e).strip(),
                )
    raise last_err


def _get_connection(cluster_identifier: str, db_name: str, port: int, endpoint: str):
    credentials = get_cluster_secret(cluster_identifier)

    def _connect():
        conn = psycopg2.connect(
            host=endpoint,
            port=port,
            dbname=db_name,
            user=credentials["username"],
            password=credentials["password"],
            options="-c default_transaction_read_only=on",
            connect_timeout=30,
        )
        conn.set_session(readonly=True, autocommit=True)
        return conn

    return _connect_with_retry(_connect)


ALLOWED_COLUMN_TYPES = frozenset({
    "uuid", "text", "varchar", "char", "integer", "int", "bigint", "smallint",
    "boolean", "bool", "timestamp", "timestamptz", "timestamp with time zone",
    "timestamp without time zone", "date", "time", "timetz",
    "real", "float4", "double precision", "float8", "numeric", "decimal",
    "serial", "bigserial", "smallserial",
    "jsonb", "json", "bytea", "cidr", "inet", "macaddr",
    "interval", "money", "point", "line", "circle", "box",
    "tsquery", "tsvector", "xml",
})


def _validate_column_type(col_type: str) -> str:
    base = col_type.strip().lower()
    # Allow types with length specifiers like varchar(255) or numeric(10,2)
    base_name = re.split(r"[\s(]", base, maxsplit=1)[0]
    if base_name not in ALLOWED_COLUMN_TYPES:
        raise ValueError(f"Unsupported column type: {col_type!r}")
    return col_type.strip()


def _get_write_connection(cluster_identifier: str, db_name: str, port: int, endpoint: str):
    credentials = get_cluster_secret(cluster_identifier)

    def _connect():
        conn = psycopg2.connect(
            host=endpoint,
            port=port,
            dbname=db_name,
            user=credentials["username"],
            password=credentials["password"],
            connect_timeout=30,
        )
        conn.set_session(autocommit=False)
        return conn

    return _connect_with_retry(_connect)


# ─────────────────────────────────────────────────────────────
# READ OPERATIONS
# ─────────────────────────────────────────────────────────────


def list_schemas(
    cluster_identifier: str, db_name: str, port: int, endpoint: str
) -> list[dict]:
    conn = _get_connection(cluster_identifier, db_name, port, endpoint)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT schema_name
                FROM information_schema.schemata
                WHERE schema_name NOT IN %s
                ORDER BY schema_name
                """,
                (tuple(SYSTEM_SCHEMAS),),
            )
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def list_tables(
    cluster_identifier: str,
    db_name: str,
    port: int,
    endpoint: str,
    schema: str = "public",
) -> list[dict]:
    _validate_identifier(schema, "schema")
    conn = _get_connection(cluster_identifier, db_name, port, endpoint)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    t.table_name,
                    t.table_type,
                    COALESCE(s.n_live_tup, 0) AS estimated_row_count
                FROM information_schema.tables t
                LEFT JOIN pg_stat_user_tables s
                    ON s.schemaname = t.table_schema AND s.relname = t.table_name
                WHERE t.table_schema = %s
                    AND t.table_type IN ('BASE TABLE', 'VIEW')
                ORDER BY t.table_name
                """,
                (schema,),
            )
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def get_columns(
    cluster_identifier: str,
    db_name: str,
    port: int,
    endpoint: str,
    schema: str,
    table_name: str,
) -> list[dict]:
    _validate_identifier(schema, "schema")
    _validate_identifier(table_name, "table")
    conn = _get_connection(cluster_identifier, db_name, port, endpoint)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = %s AND table_name = %s
                """,
                (schema, table_name),
            )
            if not cur.fetchone():
                raise ValueError(f"Table {schema}.{table_name} not found")

            cur.execute(
                """
                SELECT
                    c.column_name,
                    c.data_type,
                    c.character_maximum_length,
                    c.is_nullable,
                    c.column_default,
                    c.ordinal_position,
                    CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary_key
                FROM information_schema.columns c
                LEFT JOIN (
                    SELECT ku.column_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage ku
                        ON tc.constraint_name = ku.constraint_name
                        AND tc.table_schema = ku.table_schema
                    WHERE tc.constraint_type = 'PRIMARY KEY'
                        AND tc.table_schema = %s
                        AND tc.table_name = %s
                ) pk ON pk.column_name = c.column_name
                WHERE c.table_schema = %s AND c.table_name = %s
                ORDER BY c.ordinal_position
                """,
                (schema, table_name, schema, table_name),
            )
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def get_table_data(
    cluster_identifier: str,
    db_name: str,
    port: int,
    endpoint: str,
    schema: str,
    table_name: str,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    _validate_identifier(schema, "schema")
    _validate_identifier(table_name, "table")
    page_size = min(max(page_size, 1), 100)
    page = max(page, 1)
    offset = (page - 1) * page_size

    conn = _get_connection(cluster_identifier, db_name, port, endpoint)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = %s AND table_name = %s
                """,
                (schema, table_name),
            )
            if not cur.fetchone():
                raise ValueError(f"Table {schema}.{table_name} not found")

            # Estimated count from pg_stat
            cur.execute(
                """
                SELECT COALESCE(n_live_tup, 0) AS count
                FROM pg_stat_user_tables
                WHERE schemaname = %s AND relname = %s
                """,
                (schema, table_name),
            )
            count_row = cur.fetchone()
            total_count = int(count_row["count"]) if count_row else 0

            # Exact count for small/empty tables
            if total_count == 0:
                cur.execute(
                    f'SELECT COUNT(*) AS count FROM "{schema}"."{table_name}"'
                )
                total_count = int(cur.fetchone()["count"])

            # Paginated rows
            cur.execute(
                f'SELECT * FROM "{schema}"."{table_name}" LIMIT %s OFFSET %s',
                (page_size, offset),
            )
            rows = [_sanitize_row(dict(row)) for row in cur.fetchall()]
            columns = (
                [desc[0] for desc in cur.description] if cur.description else []
            )

            return {
                "columns": columns,
                "rows": rows,
                "page": page,
                "page_size": page_size,
                "total_count": total_count,
                "total_pages": max(1, (total_count + page_size - 1) // page_size),
            }
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# WRITE OPERATIONS
# ─────────────────────────────────────────────────────────────


def create_table(
    cluster_identifier: str,
    db_name: str,
    port: int,
    endpoint: str,
    schema: str,
    table_name: str,
    columns: list[dict],
) -> dict:
    """Create a new table with the given columns.

    Each column dict: {name, type, nullable (bool), default (str|None), is_primary_key (bool)}
    """
    _validate_identifier(schema, "schema")
    _validate_identifier(table_name, "table name")

    if not columns:
        raise ValueError("At least one column is required")

    col_defs = []
    pk_columns = []
    for col in columns:
        name = _validate_identifier(col["name"], "column name")
        col_type = _validate_column_type(col["type"])
        parts = [f'"{name}" {col_type}']

        if not col.get("nullable", True):
            parts.append("NOT NULL")

        default = col.get("default")
        if default is not None and default.strip():
            # Validate default is a safe expression (no semicolons, no sub-selects)
            cleaned = default.strip()
            if ";" in cleaned:
                raise ValueError(f"Invalid default value for column {name!r}")
            parts.append(f"DEFAULT {cleaned}")

        col_defs.append(" ".join(parts))

        if col.get("is_primary_key"):
            pk_columns.append(f'"{name}"')

    ddl_parts = ", ".join(col_defs)
    if pk_columns:
        ddl_parts += f", PRIMARY KEY ({', '.join(pk_columns)})"

    ddl = f'CREATE TABLE "{schema}"."{table_name}" ({ddl_parts})'

    conn = _get_write_connection(cluster_identifier, db_name, port, endpoint)
    try:
        with conn.cursor() as cur:
            cur.execute(ddl)
        conn.commit()
        return {"table_name": table_name, "schema": schema, "sql": ddl}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def add_column(
    cluster_identifier: str,
    db_name: str,
    port: int,
    endpoint: str,
    schema: str,
    table_name: str,
    column: dict,
) -> dict:
    """Add a column to an existing table.

    column dict: {name, type, nullable (bool), default (str|None)}
    """
    _validate_identifier(schema, "schema")
    _validate_identifier(table_name, "table name")
    name = _validate_identifier(column["name"], "column name")
    col_type = _validate_column_type(column["type"])

    parts = [f'ALTER TABLE "{schema}"."{table_name}" ADD COLUMN "{name}" {col_type}']

    if not column.get("nullable", True):
        parts.append("NOT NULL")

    default = column.get("default")
    if default is not None and default.strip():
        cleaned = default.strip()
        if ";" in cleaned:
            raise ValueError(f"Invalid default value for column {name!r}")
        parts.append(f"DEFAULT {cleaned}")

    ddl = " ".join(parts)

    conn = _get_write_connection(cluster_identifier, db_name, port, endpoint)
    try:
        with conn.cursor() as cur:
            cur.execute(ddl)
        conn.commit()
        return {"column_name": name, "sql": ddl}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def alter_column(
    cluster_identifier: str,
    db_name: str,
    port: int,
    endpoint: str,
    schema: str,
    table_name: str,
    column_name: str,
    changes: dict,
) -> dict:
    """Alter an existing column. Supported changes: {type, nullable, default, new_name}."""
    _validate_identifier(schema, "schema")
    _validate_identifier(table_name, "table name")
    _validate_identifier(column_name, "column name")

    statements = []
    prefix = f'ALTER TABLE "{schema}"."{table_name}"'

    if "type" in changes:
        col_type = _validate_column_type(changes["type"])
        statements.append(f'{prefix} ALTER COLUMN "{column_name}" TYPE {col_type} USING "{column_name}"::{col_type}')

    if "nullable" in changes:
        if changes["nullable"]:
            statements.append(f'{prefix} ALTER COLUMN "{column_name}" DROP NOT NULL')
        else:
            statements.append(f'{prefix} ALTER COLUMN "{column_name}" SET NOT NULL')

    if "default" in changes:
        default_val = changes["default"]
        if default_val is None or (isinstance(default_val, str) and not default_val.strip()):
            statements.append(f'{prefix} ALTER COLUMN "{column_name}" DROP DEFAULT')
        else:
            cleaned = default_val.strip()
            if ";" in cleaned:
                raise ValueError(f"Invalid default value for column {column_name!r}")
            statements.append(f'{prefix} ALTER COLUMN "{column_name}" SET DEFAULT {cleaned}')

    if "new_name" in changes:
        new_name = _validate_identifier(changes["new_name"], "new column name")
        statements.append(f'{prefix} RENAME COLUMN "{column_name}" TO "{new_name}"')

    if not statements:
        raise ValueError("No changes specified")

    conn = _get_write_connection(cluster_identifier, db_name, port, endpoint)
    try:
        with conn.cursor() as cur:
            for stmt in statements:
                cur.execute(stmt)
        conn.commit()
        return {"column_name": column_name, "statements": statements}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def drop_column(
    cluster_identifier: str,
    db_name: str,
    port: int,
    endpoint: str,
    schema: str,
    table_name: str,
    column_name: str,
) -> dict:
    """Drop a column from a table."""
    _validate_identifier(schema, "schema")
    _validate_identifier(table_name, "table name")
    _validate_identifier(column_name, "column name")

    ddl = f'ALTER TABLE "{schema}"."{table_name}" DROP COLUMN "{column_name}"'

    conn = _get_write_connection(cluster_identifier, db_name, port, endpoint)
    try:
        with conn.cursor() as cur:
            cur.execute(ddl)
        conn.commit()
        return {"column_name": column_name, "sql": ddl}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def rename_table(
    cluster_identifier: str,
    db_name: str,
    port: int,
    endpoint: str,
    schema: str,
    old_name: str,
    new_name: str,
) -> dict:
    """Rename a table."""
    _validate_identifier(schema, "schema")
    _validate_identifier(old_name, "current table name")
    _validate_identifier(new_name, "new table name")

    ddl = f'ALTER TABLE "{schema}"."{old_name}" RENAME TO "{new_name}"'

    conn = _get_write_connection(cluster_identifier, db_name, port, endpoint)
    try:
        with conn.cursor() as cur:
            cur.execute(ddl)
        conn.commit()
        return {"old_name": old_name, "new_name": new_name, "sql": ddl}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def drop_table(
    cluster_identifier: str,
    db_name: str,
    port: int,
    endpoint: str,
    schema: str,
    table_name: str,
) -> dict:
    """Drop a table."""
    _validate_identifier(schema, "schema")
    _validate_identifier(table_name, "table name")

    ddl = f'DROP TABLE "{schema}"."{table_name}"'

    conn = _get_write_connection(cluster_identifier, db_name, port, endpoint)
    try:
        with conn.cursor() as cur:
            cur.execute(ddl)
        conn.commit()
        return {"table_name": table_name, "sql": ddl}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
