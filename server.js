const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const { Telegraf } = require("telegraf");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const botToken = process.env.TELEGRAM_BOT_TOKEN;

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "ESY EARN BD Backend is running!"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    databaseConfigured: Boolean(supabase),
    telegramConfigured: Boolean(botToken)
  });
});

let bot = null;

if (botToken) {
  bot = new Telegraf(botToken);

  bot.start((ctx) => {
    ctx.reply(
      "Welcome to ESY EARN BD! 🎉\n\nTap below to open our earning platform.",
      {
        reply_markup: {
          inline_keyboard: [[
            {
              text: "🚀 Open ESY EARN BD",
              web_app: {
                url: "https://nox3679.github.io/esy-earn-bd-/"
              }
            }
          ]]
        }
      }
    );
  });

  bot.catch((err) => {
    console.error("Telegram Bot error:", err.message);
  });

  bot.launch().then(() => {
    console.log("ESY EARN BD Telegram Bot started!");
  }).catch((err) => {
    console.error("Telegram Bot failed to start:", err.message);
  });
}

app.listen(PORT, () => {
  console.log(`ESY EARN BD server running on port ${PORT}`);
});

process.once("SIGINT", () => bot?.stop("SIGINT"));
process.once("SIGTERM", () => bot?.stop("SIGTERM"));
