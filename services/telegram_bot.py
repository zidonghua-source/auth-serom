import os
import threading
import datetime
import queue
import logging
import requests

# Configure logging for the bot
logger = logging.getLogger(__name__)

# NOTE:
# Legacy Telegram command handlers are intentionally kept as comments below
# for future restore/migration, but they are disabled to avoid polling sockets.
#
# from telegram import Update, Bot
# from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes
#
# async def set_status_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
#     # /setstatus <sn> <status>
#     ...
#
# async def set_env_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
#     # /set_env <key> <value>
#     ...
#
# async def remove_device_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
#     # /remove <sn>
#     ...
#
# async def ping_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
#     # /ping
#     ...
#
# async def uptime_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
#     # /uptime
#     ...
#
# def run_telegram_bot(app):
#     # Disabled: application.run_polling(stop_signals=None)
#     ...

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID")
_sender_queue = queue.Queue(maxsize=5000)
_sender_thread = None
_sender_thread_lock = threading.Lock()

TELEGRAM_CONNECT_TIMEOUT = float(os.environ.get("TELEGRAM_CONNECT_TIMEOUT", "5"))
TELEGRAM_READ_TIMEOUT = float(os.environ.get("TELEGRAM_READ_TIMEOUT", "20"))
TELEGRAM_POOL_SIZE = int(os.environ.get("TELEGRAM_POOL_SIZE", "20"))
TELEGRAM_API_BASE_URL = (
    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}" if TELEGRAM_BOT_TOKEN else None
)
_http_session = None
_http_session_lock = threading.Lock()


def _get_http_session():
    global _http_session
    if _http_session is None:
        with _http_session_lock:
            if _http_session is None:
                session = requests.Session()
                adapter = requests.adapters.HTTPAdapter(
                    pool_connections=TELEGRAM_POOL_SIZE,
                    pool_maxsize=TELEGRAM_POOL_SIZE,
                )
                session.mount("https://", adapter)
                session.mount("http://", adapter)
                _http_session = session
    return _http_session


def _send_telegram_http(message: str):
    if not TELEGRAM_API_BASE_URL or not TELEGRAM_CHAT_ID:
        return

    session = _get_http_session()
    try:
        response = session.post(
            f"{TELEGRAM_API_BASE_URL}/sendMessage",
            data={"chat_id": TELEGRAM_CHAT_ID, "text": message},
            timeout=(TELEGRAM_CONNECT_TIMEOUT, TELEGRAM_READ_TIMEOUT),
        )
        response.raise_for_status()
    except requests.RequestException as e:
        logger.error(f"Failed to send Telegram message: {e}")

def _sender_worker(app):
    """Single worker loop to serialize Telegram HTTP sends."""

    while True:
        item = _sender_queue.get()
        if item is None:
            _sender_queue.task_done()
            break

        kind, message = item
        try:
            if kind == "error":
                _send_telegram_http(f"🚨 ERROR: {message}")
            else:
                _send_telegram_http(message)
        except Exception as e:
            logger.error(f"Error in telegram sender worker: {e}")
        finally:
            _sender_queue.task_done()

def _start_sender_worker(app):
    global _sender_thread
    if _sender_thread is None or not _sender_thread.is_alive():
        with _sender_thread_lock:
            if _sender_thread is None or not _sender_thread.is_alive():
                _sender_thread = threading.Thread(target=_sender_worker, args=(app,), daemon=True)
                _sender_thread.start()

def _enqueue_telegram_message(app, kind, message):
    _start_sender_worker(app)
    try:
        _sender_queue.put_nowait((kind, message))
    except queue.Full:
        logger.error("Telegram sender queue is full; dropping message")

def start_bot_thread(app):
    _start_sender_worker(app)
    if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
        start_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        _enqueue_telegram_message(app, "notification", f"🚀 Application Started at {start_time}")

# Helper for logging errors from other parts of the app
def log_error_to_telegram(app, message):
    if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
        try:
            _enqueue_telegram_message(app, "error", message)
        except Exception as e:
            logger.error(f"Error dispatching telegram log: {e}")

def send_telegram_notification(app, message):
    if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
        try:
            _enqueue_telegram_message(app, "notification", message)
        except Exception as e:
            logger.error(f"Error dispatching telegram notification: {e}")
