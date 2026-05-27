from flask import request
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from functools import wraps
from datetime import timedelta

ROLES_HIERARCHY = {
    'admin': ['admin', 'view_candidates', 'select_candidates', 'send_emails', 'view_analytics'],
    'hr': ['hr', 'view_candidates', 'select_candidates', 'view_analytics']
}


def create_admin_token(admin_id: str, expires_delta: timedelta = None):
    """Create JWT access token for admin."""
    if expires_delta is None:
        expires_delta = timedelta(days=7)
    
    access_token = create_access_token(
        identity=admin_id,
        expires_delta=expires_delta,
        additional_claims={'role': 'admin'}
    )
    return access_token


def token_required(f):
    """Decorator to require valid JWT token."""
    @wraps(f)
    @jwt_required()
    def decorated(*args, **kwargs):
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    """Decorator to require admin role."""
    @wraps(f)
    @jwt_required()
    def decorated(*args, **kwargs):
        identity = get_jwt_identity()
        if not identity:
            from flask import jsonify
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated
