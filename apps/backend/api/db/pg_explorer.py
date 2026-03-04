"""
PostgreSQL Database Explorer

Read-only query utilities for browsing user-provisioned Aurora databases.
All connections are ephemeral (per-request) and session-level read-only.
"""

import re
import decimal
import datetime
import uuid

import psycopg2
import psycopg2.extras

from deployer.aws.rds import get_cluster_secret


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


def _get_connection(cluster_identifier: str, db_name: str, port: int, endpoint: str):
    credentials = get_cluster_secret(cluster_identifier)
    conn = psycopg2.connect(
        host=endpoint,
        port=port,
        dbname=db_name,
        user=credentials["username"],
        password=credentials["password"],
        options="-c default_transaction_read_only=on",
        connect_timeout=10,
    )
    conn.set_session(readonly=True, autocommit=True)
    return conn


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
