const express = require("express");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { Telegraf, Markup } = require("telegraf");

const app = express();
app.use(express.json({ limit: "20kb" }));

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET;
const ADMIN_TELEGRAM_ID = Number(process.env.ADMIN_TELEGRAM_ID || "8650837438");
const FRONTEND_ORIGIN = "https://nox3679.github.io";

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

app.use((req, res, next) => {
  if (req.headers.origin === FRONTEND_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

function verifyTelegramData(initData) {
  if (!BOT_TOKEN || typeof initData !== "string" || initData.length > 16000) return null;
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest();
  const receivedBuffer = Buffer.from(receivedHash, "hex");
  if (receivedBuffer.length !== calculatedHash.length ||
      !crypto.timingSafeEqual(receivedBuffer, calculatedHash)) return null;
  const authDate = Number(params.get("auth_date"));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || authDate > now + 60 || now - authDate > 86400) return null;
  try {
    const user = JSON.parse(params.get("user") || "null");
    return user && Number.isSafeInteger(user.id) ? user : null;
  } catch { return null; }
}

async function isAdmin(telegramId) {
  if (!supabase) return false;
  const { data, error } = await supabase.from("admin_users")
    .select("telegram_id").eq("telegram_id", telegramId).eq("role", "admin").maybeSingle();
  if (error) console.error("Admin check:", error.message);
  return Boolean(data);
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifySession(token) {
  if (!ADMIN_SESSION_SECRET || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const expected = crypto.createHmac("sha256", ADMIN_SESSION_SECRET)
    .update(parts[0]).digest("base64url");
  if (!safeEqual(parts[1], expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return payload.admin === true && Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch { return false; }
}

const loginAttempts = new Map();
function adminAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!verifySession(token)) return res.status(401).json({ success: false, message: "Session expired. Please login again." });
  next();
}

app.get("/", (req, res) => res.json({ success: true, message: "ESY EARN BD Backend is running!" }));
app.get("/api/health", (req, res) => res.json({
  success: true, databaseConfigured: Boolean(supabase), telegramConfigured: Boolean(BOT_TOKEN),
  adminConfigured: Boolean(ADMIN_PASSWORD && ADMIN_SESSION_SECRET && ADMIN_SESSION_SECRET.length >= 32)
}));

// Telegram Mini App authentication
app.post("/api/auth/telegram", async (req, res) => {
  try {
    const user = verifyTelegramData(req.body?.initData);
    if (!user) return res.status(401).json({ success: false, message: "Invalid or expired Telegram login." });
    if (!supabase) return res.status(503).json({ success: false, message: "Database is not configured." });

    const { error: profileError } = await supabase.from("profiles").upsert({
      telegram_id: user.id, username: user.username || null,
      first_name: user.first_name || null, last_name: user.last_name || null
    }, { onConflict: "telegram_id" });
    if (profileError) throw profileError;

    const { error: walletCreateError } = await supabase.from("wallets")
      .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
    if (walletCreateError) throw walletCreateError;

    const { data: wallet, error: walletError } = await supabase.from("wallets")
      .select("balance, total_earnings").eq("user_id", user.id).single();
    if (walletError) throw walletError;

    res.json({
      success: true, message: "Telegram user verified.",
      user: { id: user.id, first_name: user.first_name || null, last_name: user.last_name || null,
        username: user.username || null, photo_url: user.photo_url || null },
      wallet: { balance: wallet.balance, total_earnings: wallet.total_earnings }
    });
  } catch (error) {
    console.error("Telegram authentication:", error.message);
    res.status(500).json({ success: false, message: "Could not authenticate user." });
  }
});

// Deposit request - bKash, Nagad, Rocket only
app.post("/api/deposit", async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ success: false, message: "Database is not configured." });
    const user = verifyTelegramData(req.body?.initData);
    if (!user) return res.status(401).json({ success: false, message: "Invalid or expired Telegram login." });

    const amount = Number(req.body?.amount);
    const paymentMethod = String(req.body?.payment_method || "").trim();
    const accountNumber = String(req.body?.account_number || "").trim();
    const referenceId = String(req.body?.reference_id || "").trim();

    if (!Number.isFinite(amount) || amount < 1 || amount > 1000000 ||
        Math.round(amount * 100) !== amount * 100) {
      return res.status(400).json({ success: false, message: "Invalid deposit amount." });
    }
    if (!["bKash", "Nagad", "Rocket"].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: "Invalid payment method." });
    }
    if (accountNumber.length < 5 || accountNumber.length > 100 ||
        referenceId.length < 4 || referenceId.length > 100) {
      return res.status(400).json({ success: false, message: "Invalid payment details." });
    }

    const { data, error } = await supabase.from("transactions").insert({
      user_id: user.id, transaction_type: "deposit", amount: amount.toFixed(2),
      payment_method: paymentMethod, account_number: accountNumber,
      reference_id: referenceId, status: "pending"
    }).select("id, amount, payment_method, status, created_at").single();

    if (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "This transaction reference has already been used." });
      throw error;
    }
    res.json({ success: true, message: "Deposit request submitted for admin review.", transaction: data });
  } catch (error) {
    console.error("Deposit API:", error.message);
    res.status(500).json({ success: false, message: "Could not submit deposit request." });
  }
});

// Admin password login. Password and signing key exist only in Render environment.
app.post("/api/admin/login", (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, until: 0 };
  if (record.until > now) return res.status(429).json({ success: false, message: "Too many attempts. Try again later." });

  if (!ADMIN_PASSWORD || !ADMIN_SESSION_SECRET || ADMIN_SESSION_SECRET.length < 32) {
    return res.status(503).json({ success: false, message: "Admin login is not configured in Render." });
  }

  const supplied = String(req.body?.password || "");
  if (!safeEqual(supplied, ADMIN_PASSWORD)) {
    record.count += 1;
    if (record.count >= 5) { record.count = 0; record.until = now + 15 * 60 * 1000; }
    loginAttempts.set(ip, record);
    return res.status(401).json({ success: false, message: "Incorrect password." });
  }

  loginAttempts.delete(ip);
  const token = signSession({ admin: true, exp: Math.floor(now / 1000) + 8 * 60 * 60 });
  res.json({ success: true, token, expiresIn: 28800 });
});

app.get("/api/admin/dashboard", adminAuth, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ success: false, message: "Database is not configured." });

    const [users, wallets, pending, deposits, withdrawals] = await Promise.all([
      supabase.from("profiles").select("telegram_id", { count: "exact", head: true }),
      supabase.from("wallets").select("balance,total_earnings").limit(10000),
      supabase.from("transactions").select("id,user_id,amount,payment_method,account_number,reference_id,status,created_at")
        .eq("transaction_type", "deposit").eq("status", "pending").order("created_at", { ascending: false }).limit(100),
      supabase.from("transactions").select("id,user_id,amount,status,created_at")
        .eq("transaction_type", "deposit").order("created_at", { ascending: false }).limit(100),
      supabase.from("transactions").select("id,user_id,amount,status,created_at")
        .eq("transaction_type", "withdraw").order("created_at", { ascending: false }).limit(100)
    ]);

    for (const result of [users, wallets, pending, deposits, withdrawals]) {
      if (result.error) throw result.error;
    }
    const walletRows = wallets.data || [];
    const totalWallet = walletRows.reduce((sum, row) => sum + Number(row.balance || 0), 0);
    const totalEarnings = walletRows.reduce((sum, row) => sum + Number(row.total_earnings || 0), 0);

    res.json({ success: true, stats: {
      totalUsers: users.count || 0, walletsLoaded: walletRows.length,
      totalWallet, totalEarnings, pendingDeposits: (pending.data || []).length
    }, pendingDeposits: pending.data || [], recentDeposits: deposits.data || [],
      recentWithdrawals: withdrawals.data || [] });
  } catch (error) {
    console.error("Admin dashboard:", error.message);
    res.status(500).json({ success: false, message: "Could not load dashboard data." });
  }
});

app.post("/api/admin/deposits/:id/review", adminAuth, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ success: false, message: "Database is not configured." });
    const id = String(req.params.id || "");
    const action = String(req.body?.action || "");
    if (!/^[0-9a-f-]{36}$/i.test(id) || !["approve", "reject"].includes(action)) {
      return res.status(400).json({ success: false, message: "Invalid request." });
    }
    if (!Number.isSafeInteger(ADMIN_TELEGRAM_ID) || !(await isAdmin(ADMIN_TELEGRAM_ID))) {
      return res.status(403).json({ success: false, message: "Configured admin ID is not authorized in admin_users." });
    }

    const { data, error } = await supabase.rpc("review_deposit", {
      p_transaction_id: id, p_admin_id: ADMIN_TELEGRAM_ID, p_action: action
    });
    if (error) {
      const message = /already reviewed/i.test(error.message) ? "This request has already been reviewed." : "Could not review this deposit.";
      return res.status(400).json({ success: false, message });
    }
    res.json({ success: true, result: data });
  } catch (error) {
    console.error("Deposit review:", error.message);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Telegram bot retained
let bot = null;
if (BOT_TOKEN) {
  bot = new Telegraf(BOT_TOKEN);
  bot.start((ctx) => ctx.reply("Welcome to ESY EARN BD! 🎉", {
    reply_markup: { inline_keyboard: [[{ text: "🚀 Open ESY EARN BD", web_app: { url: "https://nox3679.github.io/esy-earn-bd-/" } }]] }
  }));

  bot.command("pending", async (ctx) => {
    try {
      if (!supabase) return ctx.reply("Database is not configured.");
      const adminId = ctx.from.id;
      if (!(await isAdmin(adminId))) return ctx.reply("⛔ You are not authorized.");
      const { data, error } = await supabase.from("transactions")
        .select("id,user_id,amount,payment_method,account_number,reference_id,created_at")
        .eq("transaction_type", "deposit").eq("status", "pending")
        .order("created_at", { ascending: true }).limit(10);
      if (error) throw error;
      if (!data?.length) return ctx.reply("✅ No pending deposits found.");
      await ctx.reply(`📥 Pending Deposits: ${data.length}`);
      for (const d of data) {
        await ctx.reply(
          `💰 NEW DEPOSIT REQUEST\n\n👤 User ID: ${d.user_id}\n💵 Amount: ৳${d.amount}\n🏦 Method: ${d.payment_method}\n📱 Account: ${d.account_number}\n🧾 Reference: ${d.reference_id}\n🕒 Date: ${d.created_at}\n🆔 Transaction: ${d.id}`,
          Markup.inlineKeyboard([[Markup.button.callback("✅ Approve", `dep_approve:${d.id}`), Markup.button.callback("❌ Reject", `dep_reject:${d.id}`)]])
        );
      }
    } catch (error) { console.error("Pending command:", error.message); ctx.reply("Could not load pending deposits."); }
  });

  for (const action of ["approve", "reject"]) {
    bot.action(new RegExp(`^dep_${action}:([0-9a-f-]{36})$`, "i"), async (ctx) => {
      try {
        const adminId = ctx.from.id;
        if (!(await isAdmin(adminId))) return ctx.answerCbQuery("Unauthorized", { show_alert: true });
        const { data, error } = await supabase.rpc("review_deposit", {
          p_transaction_id: ctx.match[1], p_admin_id: adminId, p_action: action
        });
        if (error) return ctx.answerCbQuery("Failed: " + error.message, { show_alert: true });
        await ctx.answerCbQuery(action === "approve" ? "Deposit approved!" : "Deposit rejected!");
        await ctx.editMessageText(ctx.callbackQuery.message.text +
          (action === "approve" ? `\n\n✅ APPROVED\n💵 Added: ৳${data.amount}` : "\n\n❌ REJECTED"));
      } catch (error) {
        console.error("Deposit action:", error.message);
        ctx.answerCbQuery("Something went wrong.", { show_alert: true });
      }
    });
  }
  bot.catch((err) => console.error("Telegram Bot error:", err.message));
  bot.launch().then(() => console.log("Telegram Bot started!"))
    .catch((err) => console.error("Telegram Bot failed:", err.message));
}

app.listen(PORT, () => console.log(`ESY EARN BD server running on port ${PORT}`));
process.once("SIGINT", () => bot?.stop("SIGINT"));
process.once("SIGTERM", () => bot?.stop("SIGTERM"));
