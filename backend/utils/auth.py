"""Validate Supabase access tokens with the Auth server (supports key rotation)."""
import json
import os
from functools import wraps
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from flask import g, jsonify, request


def _verified_user(token):
    project_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    publishable_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_PUBLISHABLE_KEY")
    if not project_url or not publishable_key:
        return None, "not_configured"
    req = Request(f"{project_url}/auth/v1/user", headers={"apikey": publishable_key, "Authorization": f"Bearer {token}"})
    try:
        with urlopen(req, timeout=5) as response:
            return json.loads(response.read()), None
    except HTTPError as error:
        if error.code in (400, 401, 403):
            return None, "invalid"
        return None, "unavailable"
    except (URLError, TimeoutError, ValueError):
        return None, "unavailable"


def require_user(*roles):
    """Protect an endpoint; never accept role claims supplied by the browser."""
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            header = request.headers.get("Authorization", "")
            token = header[7:].strip() if header.lower().startswith("bearer ") else ""
            if not token:
                return jsonify(message="Authentication required"), 401
            user, error = _verified_user(token)
            if error == "not_configured":
                return jsonify(message="Authentication service is not configured"), 503
            if error == "unavailable":
                return jsonify(message="Authentication service is temporarily unavailable"), 503
            if error or not user or not user.get("id"):
                return jsonify(message="Invalid or expired access token"), 401
            g.user_id = user["id"]
            if roles:
                from database.db import get_db_connection
                try:
                    with get_db_connection() as connection, connection.cursor() as cursor:
                        cursor.execute("select role from public.profiles where id = %s", (g.user_id,))
                        profile = cursor.fetchone()
                    g.user_role = profile["role"] if profile else None
                except Exception:
                    return jsonify(message="Authorization service is temporarily unavailable"), 503
                if g.user_role not in roles:
                    return jsonify(message="Insufficient permissions"), 403
            return view(*args, **kwargs)
        return wrapped
    return decorator
