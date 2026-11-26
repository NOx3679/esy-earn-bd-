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

// Frontend CORS
app.use((req, res, next) => {
  const allowedOrigin = "https://nox3679.github.io";

  if (req.headers.origin === allowedOrigin) {
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
  if (initData.length > 16000) return null;

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
  const now = Math.floor(Date.now() / 1000);

  if (
    !Number.isFinite(authDate) ||
    authDate > now + 60 ||
    now - authDate > 86400
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

// Home
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "ESY EARN BD Backend is running!"
  });
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    databaseConfigured: Boolean(supabase),
    telegramConfigured: Boolean(BOT_TOKEN)
  });
});

// Telegram authentication + Profile + Wallet
app.post("/api/auth/telegram", async (req, res) => {
  try {
    const user = verifyTelegramData(req.body?.initData);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired Telegram login."
      });
    }

    if (!supabase) {
      return res.status(503).json({
        success: false,
        message: "Database is not configured."
      });
    }

    // Save or update Telegram profile
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(
        {
          telegram_id: user.id,
          username: user.username || null,
          first_name: user.first_name || null,
          last_name: user.last_name || null
        },
        { onConflict: "telegram_id" }
      );

    if (profileError) {
      console.error("Profile error:", profileError.message);
      return res.status(500).json({
        success: false,
        message: "Could not save user profile."
      });
    }

    // Create wallet only if it does not already exist
    const { error: walletCreateError } = await supabase
      .from("wallets")
      .upsert(
        { user_id: user.id },
        {
          onConflict: "user_id",
          ignoreDuplicates: true
        }
      );

    if (walletCreateError) {
      console.error("Wallet creation error:", walletCreateError.message);
      return res.status(500).json({
        success: false,
        message: "Could not create user wallet."
      });
    }

    // Read wallet
    const { data: wallet, error: walletReadError } = await supabase
      .from("wallets")
      .select("balance, total_earnings")
      .eq("user_id", user.id)
      .single();

    if (walletReadError) {
      console.error("Wallet read error:", walletReadError.message);
      return res.status(500).json({
        success: false,
        message: "Could not load user wallet."
      });
    }

    return res.json({
      success: true,
      message: "Telegram user verified and saved.",
      user: {
        id: user.id,
        first_name: user.first_name || null,
        last_name: user.last_name || null,
        username: user.username || null,
        photo_url: user.photo_url || null
      },
      wallet: {
        balance: wallet.balance,
        total_earnings: wallet.total_earnings
      }
    });

  } catch (error) {
    console.error("Authentication error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Server error during authentication."
    });
  }
});

// Deposit Request API
app.post("/api/deposit", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({
        success: false,
        message: "Database is not configured."
      });
    }

    // Verify Telegram user
    const user = verifyTelegramData(req.body?.initData);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired Telegram login."
      });
    }

    const amount = Number(req.body?.amount);
    const paymentMethod = String(req.body?.payment_method || "").trim();
    const accountNumber = String(req.body?.account_number || "").trim();
    const referenceId = String(req.body?.reference_id || "").trim();

    // Validate amount
    if (
      !Number.isFinite(amount) ||
      amount < 1 ||
      amount > 1000000 ||
      Math.round(amount * 100) !== amount * 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid deposit amount."
      });
    }

    // Allowed payment methods
    if (!["Nagad", "Rocket", "Binance"].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method."
      });
    }

    if (
      accountNumber.length < 5 ||
      accountNumber.length > 100 ||
      referenceId.length < 4 ||
      referenceId.length > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment details."
      });
    }

    // Save deposit as pending
    const { data, error } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        transaction_type: "deposit",
        amount: amount.toFixed(2),
        payment_method: paymentMethod,
        account_number: accountNumber,
        reference_id: referenceId,
        status: "pending"
      })
      .select("id, amount, payment_method, status, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          message: "This transaction reference has already been used."
        });
      }

      console.error("Deposit error:", error.message);

      return res.status(500).json({
        success: false,
        message: "Could not submit deposit request."
      });
    }

    return res.json({
      success: true,
      message: "Deposit request submitted for admin review.",
      transaction: data
    });

  } catch (error) {
    console.error("Deposit API error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Server error."
    });
  }
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

  bot.launch()
    .then(() => console.log("Telegram Bot started!"))
    .catch((err) => console.error("Telegram Bot failed:", err.message));
}

// Start server
app.listen(PORT, () => {
  console.log(`ESY EARN BD server running on port ${PORT}`);
});

process.once("SIGINT", () => bot?.stop("SIGINT"));
process.once("SIGTERM", () => bot?.stop("SIGTERM"));
