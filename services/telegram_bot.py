import os
import threading
import asyncio
import datetime
import queue
from telegram import Update, Bot
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes
from telegram.request import HTTPXRequest
from extensions import db
from models.device_info import DeviceInfo
import logging

# Configure logging for the bot
logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID")
_telegram_service_instance = None
_telegram_service_lock = threading.Lock()
_sender_queue = queue.Queue(maxsize=5000)
_sender_thread = None
_sender_thread_lock = threading.Lock()

TELEGRAM_CONNECT_TIMEOUT = float(os.environ.get("TELEGRAM_CONNECT_TIMEOUT", "5"))
TELEGRAM_READ_TIMEOUT = float(os.environ.get("TELEGRAM_READ_TIMEOUT", "20"))
TELEGRAM_WRITE_TIMEOUT = float(os.environ.get("TELEGRAM_WRITE_TIMEOUT", "20"))
TELEGRAM_POOL_TIMEOUT = float(os.environ.get("TELEGRAM_POOL_TIMEOUT", "5"))
TELEGRAM_POOL_SIZE = int(os.environ.get("TELEGRAM_POOL_SIZE", "20"))


def _build_telegram_request(pool_size: int) -> HTTPXRequest:
    return HTTPXRequest(
        connect_timeout=TELEGRAM_CONNECT_TIMEOUT,
        read_timeout=TELEGRAM_READ_TIMEOUT,
        write_timeout=TELEGRAM_WRITE_TIMEOUT,
        pool_timeout=TELEGRAM_POOL_TIMEOUT,
        connection_pool_size=pool_size,
    )

class TelegramService:
    def __init__(self, app):
         self.app = app
         self._request = _build_telegram_request(TELEGRAM_POOL_SIZE)
         self.bot = Bot(token=TELEGRAM_BOT_TOKEN, request=self._request) if TELEGRAM_BOT_TOKEN else None

    async def send_error_log(self, message):
        if self.bot and TELEGRAM_CHAT_ID:
            try:
                await self.bot.send_message(chat_id=TELEGRAM_CHAT_ID, text=f"🚨 ERROR: {message}")
            except Exception as e:
                logger.error(f"Failed to send Telegram log: {e}")

    async def set_status_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        try:
             # /setstatus <sn> <status>
             args = context.args
             if len(args) != 2:
                 await update.message.reply_text("Usage: /setstatus <SN> <STATUS>")
                 return
             
             sn = args[0]
             new_status = args[1]
             
             # Need app context to access DB
             with self.app.app_context():
                 device = DeviceInfo.query.get(sn)
                 if device:
                     device.status = new_status
                     db.session.commit()
                     await update.message.reply_text(f"✅ Status of {sn} updated to {new_status}")
                 else:
                     await update.message.reply_text(f"❌ Device {sn} not found.")
                     
        except Exception as e:
            await update.message.reply_text(f"⚠️ Error updating status: {str(e)}")

    async def send_message(self, message):
        if self.bot and TELEGRAM_CHAT_ID:
            try:
                await self.bot.send_message(chat_id=TELEGRAM_CHAT_ID, text=message)
            except Exception as e:
                logger.error(f"Failed to send Telegram message: {e}")

    async def set_env_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        try:
             # /set_env <key> <value>
             args = context.args
             if len(args) != 2:
                 await update.message.reply_text("Usage: /set_env <KEY> <VALUE>")
                 return
             

             key = args[0]
             value = args[1]
             logger.info(f"Old env {key}={os.environ.get(key)}")
             logger.info(f"Setting env {key}={value}")
             os.environ[key] = value
             await update.message.reply_text(f"✅ Set env {key}={value}")
                      
        except Exception as e:
            await update.message.reply_text(f"⚠️ Error setting env: {str(e)}")

    async def remove_device_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        try:
            # /remove <sn>
            args = context.args
            if len(args) != 1:
                await update.message.reply_text("Usage: /remove <SN>")
                return

            sn = args[0]
            with self.app.app_context():
                device = DeviceInfo.query.get(sn)
                if device:
                    db.session.delete(device)
                    db.session.commit()
                    await update.message.reply_text(f"✅ Removed device {sn}")
                else:
                    await update.message.reply_text(f"❌ Device {sn} not found.")
        except Exception as e:
            await update.message.reply_text(f"⚠️ Error removing device: {str(e)}")

    async def startup_notification(self):
         if self.bot and TELEGRAM_CHAT_ID:
             try:
                 start_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                 await self.bot.send_message(chat_id=TELEGRAM_CHAT_ID, text=f"🚀 Application Started at {start_time}")
             except Exception as e:
                 logger.error(f"Failed to send startup notification: {e}")

    async def ping_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        await update.message.reply_text("pong")

    async def uptime_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        # Calculate uptime (simple approximation)
        # In a real scenario, track start time globally
        current_time = datetime.datetime.now()
        await update.message.reply_text(f"🕒 Current Time: {current_time.strftime('%Y-%m-%d %H:%M:%S')}")

def get_telegram_service(app):
    global _telegram_service_instance
    if _telegram_service_instance is None:
        with _telegram_service_lock:
            if _telegram_service_instance is None:
                _telegram_service_instance = TelegramService(app)
    return _telegram_service_instance

def _sender_worker(app):
    """Single worker loop to avoid creating one thread/event loop per message."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    telegram_service = get_telegram_service(app)

    while True:
        item = _sender_queue.get()
        if item is None:
            _sender_queue.task_done()
            break

        kind, message = item
        try:
            if kind == "error":
                loop.run_until_complete(telegram_service.send_error_log(message))
            else:
                loop.run_until_complete(telegram_service.send_message(message))
        except Exception as e:
            logger.error(f"Error in telegram sender worker: {e}")
        finally:
            _sender_queue.task_done()

    loop.close()

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

def run_telegram_bot(app):
    if not TELEGRAM_BOT_TOKEN:
        logger.error("Telegram Token not found. Bot will not start.")
        return

    # Define post_init hook to run startup notification
    async def on_startup(application):
        telegram_service = get_telegram_service(app)
        # We can update the service's bot to match the application's bot if desired, 
        # but the service initialized its own. 
        # Let's just call the notification method.
        # Since startup_notification uses self.bot, checking if it's initialized is enough.
        await telegram_service.startup_notification()

    # Create telegram service instance once for handlers
    telegram_service = get_telegram_service(app)

    # Use post_init to schedule startup tasks safely within the bot's loop
    telegram_request = _build_telegram_request(TELEGRAM_POOL_SIZE)
    get_updates_request = _build_telegram_request(max(2, TELEGRAM_POOL_SIZE // 2))
    application = (
        ApplicationBuilder()
        .token(TELEGRAM_BOT_TOKEN)
        .request(telegram_request)
        .get_updates_request(get_updates_request)
        .post_init(on_startup)
        .build()
    )
    
    # Register handlers
    application.add_handler(CommandHandler("setstatus", telegram_service.set_status_command))
    application.add_handler(CommandHandler("set_env", telegram_service.set_env_command))
    application.add_handler(CommandHandler("remove", telegram_service.remove_device_command))
    application.add_handler(CommandHandler("ping", telegram_service.ping_command))
    application.add_handler(CommandHandler("uptime", telegram_service.uptime_command))
    
    logger.info("Telegram Bot Service Started...")
    # allowed_updates=Update.ALL_TYPES makes sure we get everything, but defaults are usually fine
    # stop_signals=None is REQUIRED when running in a background thread to avoid "set_wakeup_fd" errors
    application.run_polling(stop_signals=None)

def start_bot_thread(app):
    thread = threading.Thread(target=run_telegram_bot, args=(app,))
    thread.daemon = True
    thread.start()
    _start_sender_worker(app)

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
