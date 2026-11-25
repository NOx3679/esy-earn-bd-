const express = require("express");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { Telegraf } = require("telegraf");

const app = express();
app.use(express.json({ limit: "20kb" }));

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
    : null;

// Frontend connection
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigin = "https://nox3679.github.io";

  if (origin === allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Verify Telegram Mini App data
function verifyTelegramData(initData) {
  if (!BOT_TOKEN || typeof initData !== "string") return null;

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");

  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    return null;
  }

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(BOT_TOKEN)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest();

  const receivedBuffer = Buffer.from(receivedHash, "hex");

  if (
    receivedBuffer.length !== calculatedHash.length ||
    !crypto.timingSafeEqual(receivedBuffer, calculatedHash)
  ) {
    return null;
  }

  const authDate = Number(params.get("auth_date"));

  if (
    !Number.isFinite(authDate) ||
    authDate > Math.floor(Date.now() / 1000) + 60 ||
    Math.floor(Date.now() / 1000) - authDate > 86400
  ) {
    return null;
  }

  try {
    const user = JSON.parse(params.get("user") || "null");

    if (!user || !Number.isSafeInteger(user.id)) return null;

    return user;
  } catch {
    return null;
  }
}

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
    telegramConfigured: Boolean(BOT_TOKEN)
  });
});

// Telegram authentication
app.post("/api/auth/telegram", (req, res) => {
  const user = verifyTelegramData(req.body?.initData);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired Telegram login."
    });
  }

  res.json({
    success: true,
    message: "Telegram user verified.",
    user: {
      id: user.id,
      first_name: user.first_name,
      username: user.username || null,
      photo_url: user.photo_url || null
    }
  });
});

// Telegram Bot
let bot = null;

if (BOT_TOKEN) {
  bot = new Telegraf(BOT_TOKEN);

  bot.start((ctx) => {
    ctx.reply(
      "Welcome to ESY EARN BD! 🎉",
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
    console.log("Telegram Bot started!");
  }).catch((err) => {
    console.error("Telegram Bot failed:", err.message);
  });
}

app.listen(PORT, () => {
  console.log(`ESY EARN BD server running on port ${PORT}`);
});

process.once("SIGINT", () => bot?.stop("SIGINT"));
process.once("SIGTERM", () => bot?.stop("SIGTERM"));
