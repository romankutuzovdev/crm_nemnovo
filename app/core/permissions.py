from functools import wraps
from typing import Callable

from fastapi import Depends

from app.core.exceptions import ForbiddenError

PERMISSIONS: dict[str, dict[str, list[str]]] = {
    "admin": {
        "users":         ["read", "write", "delete"],
        "clients":       ["read", "write", "delete"],
        "leads":         ["read", "write", "delete"],
        # В терминах ТЗ это "orders", но пока оставляем совместимость:
        "deals":         ["read", "write", "delete"],
        "orders":        ["read", "write", "delete"],
        "bookings":      ["read", "write", "delete"],
        "assets":        ["read", "write", "delete"],
        "payments":      ["read", "write", "delete", "refund"],
        "notifications": ["read", "write"],
        "reports":       ["read", "export"],
        "reports_analytics": ["read"],
        "settings":      ["read", "write"],
        "integrations":  ["read", "write"],
    },
    "director": {
        "users":         ["read"],
        "clients":       ["read", "write"],
        "leads":         ["read", "write", "delete"],
        "deals":         ["read", "write", "delete"],
        "orders":        ["read", "write", "delete"],
        "bookings":      ["read", "write"],
        "assets":        ["read", "write"],
        "payments":      ["read", "write", "refund"],
        "notifications": ["read"],
        "reports":       ["read", "export"],
        "reports_analytics": ["read"],
        "settings":      ["read", "write"],
        "integrations":  ["read"],
    },
    "manager": {
        "clients":       ["read", "write"],
        "leads":         ["read", "write"],
        "deals":         ["read", "write"],
        "orders":        ["read", "write"],
        "bookings":      ["read", "write"],
        "assets":        ["read"],
        "payments":      ["read", "write"],
        "notifications": ["read"],
        "reports":       ["read"],
    },
}


def has_permission(role_name: str, resource: str, action: str) -> bool:
    return action in PERMISSIONS.get(role_name, {}).get(resource, [])


def _has_permission_from_role_json(role_permissions: dict, resource: str, action: str) -> bool:
    """
    Role.permissions (JSON) format:
      {
        "orders": ["read", "write"],
        "payments": ["read", "write", "refund"]
      }
    """
    if not role_permissions:
        return False
    allowed = role_permissions.get(resource, [])
    return action in allowed


def require_permission(resource: str, action: str) -> Callable:
    """FastAPI dependency factory for RBAC permission check."""
    from app.modules.auth.dependencies import get_current_user

    async def dependency(current_user=Depends(get_current_user)):
        role = getattr(current_user, "role", None)
        role_perms = getattr(role, "permissions", None) if role is not None else None
        ok = False
        if isinstance(role_perms, dict) and role_perms:
            ok = _has_permission_from_role_json(role_perms, resource, action)
        if not ok:
            ok = has_permission(current_user.role.name, resource, action)
        if not ok:
            raise ForbiddenError(
                detail=f"Permission denied: {action} on {resource}"
            )
        return current_user

    return Depends(dependency)
