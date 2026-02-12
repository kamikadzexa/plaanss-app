require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const crypto = require("crypto");

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const COOKIE_NAME = "plaanss_auth";
const COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

const allowedOrigin = process.env.CORS_ORIGIN || true;

app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());

const issueToken = (user) => jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.[COOKIE_NAME];
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
  const token = bearerToken || cookieToken;

  if (!token) {
    return res.status(401).json({ error: "Missing authentication token" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

const buildAuthCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: COOKIE_MAX_AGE_MS,
});

const adminMiddleware = async (req, res, next) => {
  try {
    const result = await pool.query("SELECT id, is_admin, is_approved FROM users WHERE id = $1", [req.user.id]);
    const user = result.rows[0];

    if (!user || !user.is_approved) {
      return res.status(403).json({ error: "User is not approved" });
    }

    if (!user.is_admin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    next();
  } catch (error) {
    return res.status(500).json({ error: "Unable to verify admin access" });
  }
};

const sanitizeEvent = (row) => ({
  id: row.id,
  title: row.title,
  start: row.start_time ? new Date(row.start_time).toISOString() : null,
  end: row.end_time ? new Date(row.end_time).toISOString() : null,
  allDay: row.all_day,
  notes: row.notes || "",
  telegramNotification: {
    minutesBefore: Number(row.telegram_notify_minutes ?? 60),
    notifyAll: row.telegram_notify_mode === "all",
    userIds: Array.isArray(row.telegram_notify_user_ids) ? row.telegram_notify_user_ids : [],
  },
});

const sanitizeUser = (row) => ({
  id: row.id,
  email: row.email,
  isAdmin: row.is_admin,
  isApproved: row.is_approved,
  timezone: row.timezone || "UTC",
  createdAt: row.created_at,
  telegramStatus: row.telegram_chat_id ? "connected" : "not_connected",
});

const sanitizeTelegramSettings = (row) => ({
  botName: row?.bot_name || "",
  botLink: row?.bot_link || "",
  hasBotToken: Boolean(row?.bot_token),
});

const buildTelegramApiUrl = (botToken, method) => `https://api.telegram.org/bot${botToken}/${method}`;

const fetchTelegramUpdates = async (botToken, offset) => {
  const response = await fetch(buildTelegramApiUrl(botToken, "getUpdates"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      timeout: 20,
      offset,
      allowed_updates: ["message"],
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    throw new Error(data?.description || "Unable to fetch Telegram updates");
  }

  return data.result || [];
};


const sendTelegramMessage = async (botToken, chatId, text) => {
  const response = await fetch(buildTelegramApiUrl(botToken, "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    throw new Error(data?.description || "Unable to send Telegram message");
  }
};

const normalizeTelegramNotification = (input) => {
  const minutesRaw = Number.parseInt(input?.minutesBefore, 10);
  const minutesBefore = Number.isNaN(minutesRaw) ? 60 : Math.max(1, Math.min(7 * 24 * 60, minutesRaw));
  const notifyAll = Boolean(input?.notifyAll);
  const userIds = Array.isArray(input?.userIds)
    ? [...new Set(input.userIds.map((value) => Number.parseInt(value, 10)).filter((value) => !Number.isNaN(value)))]
    : [];

  let mode = "none";
  if (notifyAll) {
    mode = "all";
  } else if (userIds.length > 0) {
    mode = "specific";
  }

  return {
    minutesBefore,
    mode,
    userIds,
  };
};

const normalizeTimezone = (value) => {
  const timezone = `${value || ""}`.trim();
  if (!timezone) {
    return "UTC";
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch (error) {
    return "UTC";
  }
};

const formatEventNotificationMessage = (event, timezone) => {
  const start = event.start_time ? new Date(event.start_time) : null;
  const safeTimezone = normalizeTimezone(timezone);
  const now = new Date();
  const minutesToStart = start && !Number.isNaN(start.getTime()) ? Math.max(0, Math.ceil((start.getTime() - now.getTime()) / 60000)) : 0;
  const startLabel =
    start && !Number.isNaN(start.getTime())
      ? new Intl.DateTimeFormat("en-GB", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: safeTimezone,
        }).format(start)
      : "unknown time";

  return `🔔 ${event.title} starts in *${minutesToStart} minutes to its beginning*\n${event.notes || "No description"}\n${startLabel} (${safeTimezone})`;
};

const dispatchPendingEventNotifications = async () => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const pendingResult = await client.query(
      `SELECT id, title, start_time, notes, telegram_notify_mode, telegram_notify_user_ids
       FROM events
       WHERE telegram_notified_at IS NULL
         AND telegram_notify_mode <> 'none'
         AND start_time - make_interval(mins => telegram_notify_minutes) <= NOW()
         AND start_time > NOW()`
    );

    if (!pendingResult.rows.length) {
      await client.query("COMMIT");
      return;
    }

    const settingsResult = await client.query("SELECT bot_token FROM telegram_settings WHERE id = 1");
    const botToken = settingsResult.rows[0]?.bot_token;

    if (!botToken) {
      await client.query("COMMIT");
      return;
    }

    for (const event of pendingResult.rows) {
      let recipientsQuery = null;
      let recipientsParams = [];

      if (event.telegram_notify_mode === "all") {
        recipientsQuery =
          "SELECT telegram_chat_id, timezone FROM users WHERE is_approved = TRUE AND telegram_chat_id IS NOT NULL";
      } else if (event.telegram_notify_mode === "specific") {
        const userIds = Array.isArray(event.telegram_notify_user_ids) ? event.telegram_notify_user_ids : [];
        if (!userIds.length) {
          await client.query("UPDATE events SET telegram_notified_at = NOW() WHERE id = $1", [event.id]);
          continue;
        }

        recipientsQuery =
          "SELECT telegram_chat_id, timezone FROM users WHERE is_approved = TRUE AND telegram_chat_id IS NOT NULL AND id = ANY($1::int[])";
        recipientsParams = [userIds];
      }

      if (!recipientsQuery) {
        await client.query("UPDATE events SET telegram_notified_at = NOW() WHERE id = $1", [event.id]);
        continue;
      }

      const recipientsResult = await client.query(recipientsQuery, recipientsParams);
      

      for (const recipient of recipientsResult.rows) {
        try {
          const message = formatEventNotificationMessage(event, recipient.timezone);
          await sendTelegramMessage(botToken, recipient.telegram_chat_id, message);
        } catch (sendError) {
          console.error(`Telegram event notification failed for event ${event.id}:`, sendError.message);
        }
      }

      await client.query("UPDATE events SET telegram_notified_at = NOW() WHERE id = $1", [event.id]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to dispatch event notifications:", error.message);
  } finally {
    client.release();
  }
};

const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_subscription_token TEXT");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC'");
  await pool.query("UPDATE users SET timezone = 'UTC' WHERE timezone IS NULL OR timezone = ''");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ,
      all_day BOOLEAN DEFAULT FALSE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS telegram_notify_minutes INTEGER DEFAULT 60");
  await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS telegram_notify_mode TEXT DEFAULT 'none'");
  await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS telegram_notify_user_ids INTEGER[] DEFAULT ARRAY[]::INTEGER[]");
  await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS telegram_notified_at TIMESTAMPTZ");
  await pool.query(
    "UPDATE events SET telegram_notify_mode = 'none' WHERE telegram_notify_mode IS NULL OR telegram_notify_mode NOT IN ('none', 'all', 'specific')"
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS telegram_settings (
      id INTEGER PRIMARY KEY,
      bot_token TEXT,
      bot_name TEXT,
      bot_link TEXT,
      last_update_id BIGINT DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(
    `INSERT INTO telegram_settings (id, bot_token, bot_name, bot_link, last_update_id)
     VALUES (1, '', '', '', 0)
     ON CONFLICT (id) DO NOTHING`
  );


  await pool.query(`
    ALTER TABLE events
    ALTER COLUMN start_time TYPE TIMESTAMPTZ USING start_time AT TIME ZONE 'UTC'
  `);

  await pool.query(`
    ALTER TABLE events
    ALTER COLUMN end_time TYPE TIMESTAMPTZ USING end_time AT TIME ZONE 'UTC'
  `);

  await pool.query(`
    WITH first_user AS (
      SELECT id FROM users ORDER BY id ASC LIMIT 1
    )
    UPDATE users
    SET is_admin = TRUE, is_approved = TRUE
    WHERE id IN (SELECT id FROM first_user)
      AND NOT EXISTS (SELECT 1 FROM users WHERE is_admin = TRUE)
  `);
};

app.get("/", (req, res) => {
  res.json({
    name: "Plaanss API",
    status: "ok",
    health: "/health",
  });
});

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (error) {
    res.status(500).json({ status: "error", details: "Database unavailable" });
  }
});

app.post("/auth/register", async (req, res) => {
  const { email, password, timezone } = req.body;

  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: "Email and password (min 6 chars) are required" });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedTimezone = normalizeTimezone(timezone);

  try {
    const userCountResult = await pool.query("SELECT COUNT(*)::int AS count FROM users");
    const isFirstUser = userCountResult.rows[0].count === 0;

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin, is_approved, timezone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, is_admin, is_approved, timezone`,
      [normalizedEmail, passwordHash, isFirstUser, isFirstUser, normalizedTimezone]
    );

    const user = result.rows[0];

    if (!user.is_approved) {
      return res.status(201).json({
        user: sanitizeUser(user),
        requiresApproval: true,
        message: "Registration successful. Wait for an admin to approve your account.",
      });
    }

    const token = issueToken(user);
    res.cookie(COOKIE_NAME, token, buildAuthCookieOptions());
    return res.status(201).json({ token, user: sanitizeUser(user), requiresApproval: false });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Email already registered" });
    }

    return res.status(500).json({ error: "Unable to create user" });
  }
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase().trim()]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.is_approved) {
      return res.status(403).json({ error: "Your account is waiting for admin approval" });
    }

    const token = issueToken(user);
    res.cookie(COOKIE_NAME, token, buildAuthCookieOptions());
    return res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ error: "Unable to login" });
  }
});

app.get("/auth/me", authMiddleware, async (req, res) => {
  const result = await pool.query(
    "SELECT id, email, is_admin, is_approved, created_at, telegram_chat_id, timezone FROM users WHERE id = $1",
    [req.user.id]
  );
  const user = result.rows[0];

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (!user.is_approved) {
    return res.status(403).json({ error: "User is not approved" });
  }

  return res.json({ user: sanitizeUser(user) });
});

app.post("/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res.status(204).send();
});

app.get("/admin/users", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, email, is_admin, is_approved, created_at, telegram_chat_id, timezone FROM users ORDER BY created_at ASC"
    );
    return res.json({ users: result.rows.map(sanitizeUser) });
  } catch (error) {
    return res.status(500).json({ error: "Unable to fetch users" });
  }
});

app.put("/admin/users/:id", authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { email, password, isAdmin, isApproved, timezone } = req.body;

  if (!email || !email.trim()) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const targetResult = await pool.query("SELECT id FROM users WHERE id = $1", [id]);
    if (!targetResult.rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const adminCountResult = await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE is_admin = TRUE");
    const adminCount = adminCountResult.rows[0].count;

    if (adminCount === 1 && isAdmin === false && Number(id) === req.user.id) {
      return res.status(400).json({ error: "You cannot remove the last admin role from yourself" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedTimezone = normalizeTimezone(timezone);

    if (password && password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      const result = await pool.query(
        `UPDATE users
         SET email = $1,
             is_admin = $2,
             is_approved = $3,
             password_hash = $4,
             timezone = $5
         WHERE id = $6
         RETURNING id, email, is_admin, is_approved, created_at, telegram_chat_id, timezone`,
        [normalizedEmail, Boolean(isAdmin), Boolean(isApproved), passwordHash, normalizedTimezone, id]
      );
      return res.json({ user: sanitizeUser(result.rows[0]) });
    }

    const result = await pool.query(
      `UPDATE users
       SET email = $1,
           is_admin = $2,
           is_approved = $3,
           timezone = $4
       WHERE id = $5
       RETURNING id, email, is_admin, is_approved, created_at, telegram_chat_id, timezone`,
      [normalizedEmail, Boolean(isAdmin), Boolean(isApproved), normalizedTimezone, id]
    );

    return res.json({ user: sanitizeUser(result.rows[0]) });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Email already in use" });
    }

    return res.status(500).json({ error: "Unable to update user" });
  }
});

app.get("/events", authMiddleware, async (req, res) => {
  try {
    const userResult = await pool.query("SELECT is_approved FROM users WHERE id = $1", [req.user.id]);
    if (!userResult.rows.length || !userResult.rows[0].is_approved) {
      return res.status(403).json({ error: "User is not approved" });
    }

    const result = await pool.query(
      `SELECT id, title, start_time, end_time, all_day, notes,
              telegram_notify_minutes, telegram_notify_mode, telegram_notify_user_ids
       FROM events
       ORDER BY start_time ASC`
    );

    return res.json({ events: result.rows.map(sanitizeEvent) });
  } catch (error) {
    return res.status(500).json({ error: "Unable to fetch events" });
  }
});

app.post("/events", authMiddleware, async (req, res) => {
  const { title, start, end, allDay, notes, telegramNotification } = req.body;

  if (!title || !start) {
    return res.status(400).json({ error: "Event title and start are required" });
  }

  try {
    const userResult = await pool.query("SELECT is_approved FROM users WHERE id = $1", [req.user.id]);
    if (!userResult.rows.length || !userResult.rows[0].is_approved) {
      return res.status(403).json({ error: "User is not approved" });
    }

    const notification = normalizeTelegramNotification(telegramNotification);

    const result = await pool.query(
      `INSERT INTO events (
         user_id, title, start_time, end_time, all_day, notes,
         telegram_notify_minutes, telegram_notify_mode, telegram_notify_user_ids, telegram_notified_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL)
       RETURNING id, title, start_time, end_time, all_day, notes,
                 telegram_notify_minutes, telegram_notify_mode, telegram_notify_user_ids`,
      [
        req.user.id,
        title.trim(),
        start,
        end || null,
        Boolean(allDay),
        notes || "",
        notification.minutesBefore,
        notification.mode,
        notification.userIds,
      ]
    );

    return res.status(201).json({ event: sanitizeEvent(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ error: "Unable to create event" });
  }
});

app.put("/events/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { title, start, end, allDay, notes, telegramNotification } = req.body;

  if (!title || !start) {
    return res.status(400).json({ error: "Event title and start are required" });
  }

  try {
    const userResult = await pool.query("SELECT is_approved FROM users WHERE id = $1", [req.user.id]);
    if (!userResult.rows.length || !userResult.rows[0].is_approved) {
      return res.status(403).json({ error: "User is not approved" });
    }

    const notification = normalizeTelegramNotification(telegramNotification);

    const result = await pool.query(
      `UPDATE events
       SET title = $1,
           start_time = $2,
           end_time = $3,
           all_day = $4,
           notes = $5,
           telegram_notify_minutes = $6,
           telegram_notify_mode = $7,
           telegram_notify_user_ids = $8,
           telegram_notified_at = NULL
       WHERE id = $9
       RETURNING id, title, start_time, end_time, all_day, notes,
                 telegram_notify_minutes, telegram_notify_mode, telegram_notify_user_ids`,
      [
        title.trim(),
        start,
        end || null,
        Boolean(allDay),
        notes || "",
        notification.minutesBefore,
        notification.mode,
        notification.userIds,
        id,
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Event not found" });
    }

    return res.json({ event: sanitizeEvent(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ error: "Unable to update event" });
  }
});

app.delete("/events/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const userResult = await pool.query("SELECT is_approved FROM users WHERE id = $1", [req.user.id]);
    if (!userResult.rows.length || !userResult.rows[0].is_approved) {
      return res.status(403).json({ error: "User is not approved" });
    }

    const result = await pool.query("DELETE FROM events WHERE id = $1 RETURNING id", [id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: "Event not found" });
    }

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Unable to delete event" });
  }
});

app.get("/admin/telegram-settings", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT bot_token, bot_name, bot_link FROM telegram_settings WHERE id = 1");
    return res.json({ settings: sanitizeTelegramSettings(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ error: "Unable to load Telegram bot settings" });
  }
});

app.get("/telegram/connected-users", authMiddleware, async (req, res) => {
  try {
    const userResult = await pool.query("SELECT is_approved FROM users WHERE id = $1", [req.user.id]);
    if (!userResult.rows.length || !userResult.rows[0].is_approved) {
      return res.status(403).json({ error: "User is not approved" });
    }

    const result = await pool.query(
      `SELECT id, email
       FROM users
       WHERE is_approved = TRUE
         AND telegram_chat_id IS NOT NULL
       ORDER BY email ASC`
    );

    return res.json({
      users: result.rows.map((entry) => ({
        id: entry.id,
        email: entry.email,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: "Unable to load connected Telegram users" });
  }
});

app.post("/admin/users/:id/telegram-message", authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const message = `${req.body?.message || ""}`.trim();

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  if (message.length > 4000) {
    return res.status(400).json({ error: "Message is too long" });
  }

  try {
    const [settingsResult, userResult] = await Promise.all([
      pool.query("SELECT bot_token FROM telegram_settings WHERE id = 1"),
      pool.query("SELECT id, email, telegram_chat_id FROM users WHERE id = $1", [id]),
    ]);

    const botToken = settingsResult.rows[0]?.bot_token;
    if (!botToken) {
      return res.status(400).json({ error: "Telegram bot is not configured" });
    }

    const target = userResult.rows[0];
    if (!target) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!target.telegram_chat_id) {
      return res.status(400).json({ error: "User has not connected Telegram bot" });
    }

    await sendTelegramMessage(botToken, target.telegram_chat_id, message);

    return res.json({ success: true, sentTo: { id: target.id, email: target.email } });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unable to send Telegram message" });
  }
});

app.put("/admin/telegram-settings", authMiddleware, adminMiddleware, async (req, res) => {
  const { botToken, botName, botLink } = req.body;

  if (!botName || !botLink) {
    return res.status(400).json({ error: "Bot name and bot link are required" });
  }

  try {
    const currentResult = await pool.query("SELECT bot_token FROM telegram_settings WHERE id = 1");
    const currentToken = currentResult.rows[0]?.bot_token || "";
    const nextToken = botToken?.trim() ? botToken.trim() : currentToken;

    if (!nextToken) {
      return res.status(400).json({ error: "Bot token is required for first-time setup" });
    }

    const result = await pool.query(
      `UPDATE telegram_settings
       SET bot_token = $1, bot_name = $2, bot_link = $3, updated_at = NOW()
       WHERE id = 1
       RETURNING bot_token, bot_name, bot_link`,
      [nextToken, botName.trim(), botLink.trim()]
    );

    return res.json({ settings: sanitizeTelegramSettings(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ error: "Unable to save Telegram bot settings" });
  }
});

app.put("/user/password", authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "Current password and new password (min 6 chars) are required" });
  }

  try {
    const result = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isValid = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const nextHash = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [nextHash, req.user.id]);

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Unable to change password" });
  }
});

app.put("/user/timezone", authMiddleware, async (req, res) => {
  const normalizedTimezone = normalizeTimezone(req.body?.timezone);

  try {
    const result = await pool.query(
      "UPDATE users SET timezone = $1 WHERE id = $2 RETURNING id, email, is_admin, is_approved, created_at, telegram_chat_id, timezone",
      [normalizedTimezone, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ user: sanitizeUser(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ error: "Unable to update timezone" });
  }
});

app.get("/user/telegram", authMiddleware, async (req, res) => {
  try {
    const [settingsResult, userResult] = await Promise.all([
      pool.query("SELECT bot_name, bot_link, bot_token FROM telegram_settings WHERE id = 1"),
      pool.query("SELECT telegram_chat_id, telegram_subscription_token FROM users WHERE id = $1", [req.user.id]),
    ]);

    const settings = settingsResult.rows[0];
    const userData = userResult.rows[0];

    let generatedId = userData?.telegram_subscription_token || "";

    if (!userData?.telegram_chat_id && !generatedId) {
      generatedId = crypto.randomUUID();
      await pool.query("UPDATE users SET telegram_subscription_token = $1 WHERE id = $2", [generatedId, req.user.id]);
    }

    return res.json({
      botName: settings?.bot_name || "",
      botLink: settings?.bot_link || "",
      hasBotToken: Boolean(settings?.bot_token),
      status: userData?.telegram_chat_id ? "Connected" : "Not connected",
      generatedId,
    });
  } catch (error) {
    return res.status(500).json({ error: "Unable to load Telegram settings" });
  }
});

app.post("/user/telegram/generate", authMiddleware, async (req, res) => {
  try {
    const generatedId = crypto.randomUUID();
    await pool.query("UPDATE users SET telegram_subscription_token = $1, telegram_chat_id = NULL WHERE id = $2", [
      generatedId,
      req.user.id,
    ]);

    return res.json({ generatedId });
  } catch (error) {
    return res.status(500).json({ error: "Unable to generate Telegram subscription id" });
  }
});

app.post("/user/telegram/verify", authMiddleware, async (req, res) => {
  try {
    const [settingsResult, userResult] = await Promise.all([
      pool.query("SELECT bot_token, last_update_id FROM telegram_settings WHERE id = 1"),
      pool.query("SELECT telegram_subscription_token FROM users WHERE id = $1", [req.user.id]),
    ]);

    const settings = settingsResult.rows[0];
    const userData = userResult.rows[0];

    if (!settings?.bot_token) {
      return res.status(400).json({ error: "Telegram bot is not configured by admin yet" });
    }

    if (!userData?.telegram_subscription_token) {
      return res.status(400).json({ error: "Generate subscription id first" });
    }

    const updates = await fetchTelegramUpdates(settings.bot_token, Number(settings.last_update_id || 0) + 1);
    let latestUpdateId = Number(settings.last_update_id || 0);
    let chatId = null;

    updates.forEach((update) => {
      latestUpdateId = Math.max(latestUpdateId, Number(update.update_id || 0));
      const text = update?.message?.text || "";
      if (text.trim() === `/start ${userData.telegram_subscription_token}`) {
        chatId = `${update?.message?.chat?.id || ""}`;
      }
    });

    if (latestUpdateId > Number(settings.last_update_id || 0)) {
      await pool.query("UPDATE telegram_settings SET last_update_id = $1 WHERE id = 1", [latestUpdateId]);
    }

    if (!chatId) {
      return res.json({ linked: false, status: "Waiting for /start message" });
    }

    await pool.query(
      "UPDATE users SET telegram_chat_id = $1, telegram_subscription_token = NULL WHERE id = $2",
      [chatId, req.user.id]
    );

    await sendTelegramMessage(settings.bot_token, chatId, "Connection successful ✅ Telegram notifications are enabled.");

    return res.json({ linked: true, status: "Connected" });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unable to verify Telegram subscription" });
  }
});

initDb()
  .then(() => {
    setInterval(() => {
      dispatchPendingEventNotifications();
    }, 60 * 1000);

    dispatchPendingEventNotifications();

    app.listen(PORT, () => {
      console.log(`Backend running on ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database", error);
    process.exit(1);
  });
