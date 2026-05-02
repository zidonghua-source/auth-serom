import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from functools import wraps
from flask import Blueprint, copy_current_request_context, jsonify
from controllers.base_controller import index, healthy, devices, login, logout, work, log_api
from extensions import db

base_bp = Blueprint('base', __name__)
REQUEST_TIMEOUT_SECONDS = int(os.environ.get("REQUEST_TIMEOUT_SECONDS", "8"))
ROUTE_TIMEOUT_WORKERS = int(os.environ.get("ROUTE_TIMEOUT_WORKERS", "20"))
_route_timeout_executor = ThreadPoolExecutor(max_workers=ROUTE_TIMEOUT_WORKERS)


def route_timeout(seconds: int):
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(*args, **kwargs):
            @copy_current_request_context
            def run_view():
                return view_func(*args, **kwargs)

            future = _route_timeout_executor.submit(run_view)
            try:
                return future.result(timeout=seconds)
            except FutureTimeoutError:
                return jsonify({"status": "timeout", "message": "Request timeout"}), 504

        return wrapper

    return decorator


def _with_timeout(view_func):
    return route_timeout(REQUEST_TIMEOUT_SECONDS)(view_func)


@base_bp.after_request
def close_client_connection(response):
    response.headers["Connection"] = "close"
    return response


@base_bp.teardown_request
def release_db_session(_error):
    db.session.remove()


base_bp.route('/', methods=['GET'])(_with_timeout(index))
base_bp.route('/healthy', methods=['GET', 'POST'])(_with_timeout(healthy))
base_bp.route('/devices', methods=['GET'])(_with_timeout(devices))
base_bp.route('/login', methods=['GET', 'POST'])(_with_timeout(login))
base_bp.route('/logout', methods=['GET'])(_with_timeout(logout))
base_bp.route('/work', methods=['GET', 'POST'])(_with_timeout(work))
base_bp.route('/log', methods=['GET', 'POST'])(_with_timeout(log_api))
