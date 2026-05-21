const MIN_INTERVAL_MS = Number(process.env.TELEGRAM_MIN_INTERVAL_MS || 1100);
const MAX_QUEUE_SIZE = Number(process.env.TELEGRAM_MAX_QUEUE_SIZE || 5000);

class TelegramService {
  static queue = [];
  static processing = false;
  static lastSentAt = 0;

  static isConfigured() {
    return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
  }

  static sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static async sendHttp(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    if (response.status === 429) {
      const body = await response.json().catch(() => ({}));
      const retryAfter = body?.parameters?.retry_after ?? 5;
      await TelegramService.sleep(retryAfter * 1000);
      return TelegramService.sendHttp(text);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram API ${response.status}: ${body}`);
    }
  }

  static async processQueue() {
    if (TelegramService.processing) return;
    TelegramService.processing = true;

    while (TelegramService.queue.length > 0) {
      const text = TelegramService.queue.shift();
      const elapsed = Date.now() - TelegramService.lastSentAt;
      if (elapsed < MIN_INTERVAL_MS) {
        await TelegramService.sleep(MIN_INTERVAL_MS - elapsed);
      }

      try {
        await TelegramService.sendHttp(text);
        TelegramService.lastSentAt = Date.now();
      } catch (err) {
        console.error("[telegram] send failed:", err.message);
      }
    }

    TelegramService.processing = false;
  }

  static enqueue(text) {
    if (!TelegramService.isConfigured()) return false;
    if (TelegramService.queue.length >= MAX_QUEUE_SIZE) {
      console.error("[telegram] queue full, dropping message");
      return false;
    }
    TelegramService.queue.push(text);
    TelegramService.processQueue();
    return true;
  }

  static notifyHealthy({ sn, imei, stid, isNew }) {
    const action = isNew ? "Đăng ký mới" : "Cập nhật";
    const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    const message = [
      `📡 ${action} /healthy`,
      `SN: ${sn}`,
      `IMEI: ${imei || "-"}`,
      `STID: ${stid || "-"}`,
      `Thời gian: ${now}`,
    ].join("\n");
    return TelegramService.enqueue(message);
  }

  static notifyStartup(port) {
    const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    const message = [
      "🚀 Server khởi động thành công",
      `Port: ${port}`,
      `Thời gian: ${now}`,
    ].join("\n");
    return TelegramService.enqueue(message);
  }
}

module.exports = TelegramService;
