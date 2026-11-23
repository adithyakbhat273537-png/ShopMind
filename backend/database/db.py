"""Secure PostgreSQL connection helpers for Supabase."""
import os
from urllib.parse import unquote, urlparse

import psycopg
from psycopg.rows import dict_row


def _database_url():
    return os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")


def get_db_connection():
    """Open a short-lived connection using a server-only PostgreSQL URL."""
    database_url = _database_url()
    if not database_url:
        raise RuntimeError("SUPABASE_DB_URL is not configured")
    parsed = urlparse(database_url)
    if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname:
        raise RuntimeError("SUPABASE_DB_URL must be a PostgreSQL connection URI")
    # Parse credentials as URI components and pass them as libpq keyword values.
    # This avoids a second URI parse of passwords containing encoded percent signs.
    return psycopg.connect(
        host=parsed.hostname,
        port=parsed.port or 5432,
        dbname=unquote(parsed.path.lstrip("/")) or "postgres",
        user=unquote(parsed.username or ""),
        password=unquote(parsed.password or ""),
        row_factory=dict_row,
        connect_timeout=8,
        sslmode="require",
    )


def check_database():
    """Return safe health details without disclosing credentials or hostnames."""
    if not _database_url():
        return {"configured": False, "connected": False, "message": "SUPABASE_DB_URL is not set"}
    try:
        with get_db_connection() as connection, connection.cursor() as cursor:
            cursor.execute("select 1 as alive")
            cursor.fetchone()
        return {"configured": True, "connected": True}
    except Exception as error:
        # Deliberately return only the exception class; driver messages can contain connection details.
        return {"configured": True, "connected": False, "error": type(error).__name__}
