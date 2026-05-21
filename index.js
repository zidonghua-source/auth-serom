require("dotenv").config();

const createApp = require("./app");
const { initDatabase } = require("./config/database");
const TelegramService = require("./services/TelegramService");

const PORT = Number(process.env.PORT || 3618);

async function start() {
  try {
    await initDatabase();
  } catch (err) {
    console.error("Database init failed:", err.message);
    process.exit(1);
  }

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    if (TelegramService.isConfigured()) {
      TelegramService.notifyStartup(PORT);
    } else {
      console.warn("[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set, skip startup message");
    }
  });
}

start();
