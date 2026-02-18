require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const XLSX = require("xlsx");

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const COOKIE_NAME = "plaanss_auth";
const COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
const SUPPORTED_LANGUAGES = ["en", "ru"];
const DEFAULT_LANGUAGE = "en";

const DEFAULT_TRANSLATIONS = {
  "notification.event.reminder": {
    en: "🔔 {{title}} starts in *{{minutes}} minutes to its beginning*\n{{notes}}\n{{startLabel}} ({{timezone}})",
    ru: "🔔 {{title}} начнётся через *{{minutes}} мин*\n{{notes}}\n{{startLabel}} ({{timezone}})",
  },
  "notification.event.unknownTime": {
    en: "unknown time",
    ru: "время неизвестно",
  },
  "notification.event.noDescription": {
    en: "No description",
    ru: "Без описания",
  },
  "notification.telegram.connected": {
    en: "Connection successful ✅ Telegram notifications are enabled.",
    ru: "Подключение успешно ✅ Уведомления Telegram включены.",
  },
  "notification.daily.title": {
    en: "🗓️ Events from 10:00 today to 10:00 tomorrow",
    ru: "🗓️ События с 10:00 сегодня до 10:00 завтра",
  },
  "notification.daily.item": {
    en: "{{time}} — {{title}}",
    ru: "{{time}} — {{title}}",
  },
};

const allowedOrigin = process.env.CORS_ORIGIN || true;
const uploadsDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });
app.use("/uploads", express.static(uploadsDir));

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
  dailyNotificationsEnabled: Boolean(row.daily_notifications_enabled),
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

const sendTelegramPhoto = async (botToken, chatId, photoUrl) => {
  const response = await fetch(buildTelegramApiUrl(botToken, "sendPhoto"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    throw new Error(data?.description || "Unable to send Telegram photo");
  }
};

const extractImageUrlsFromNotes = (notes = "") => {
  const urls = new Set();
  const markdownRegex = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
  const directRegex = /(https?:\/\/[^\s]+\.(?:png|jpe?g|gif|webp))/gi;

  let markdownMatch = markdownRegex.exec(notes);
  while (markdownMatch) {
    urls.add(markdownMatch[1]);
    markdownMatch = markdownRegex.exec(notes);
  }

  let directMatch = directRegex.exec(notes);
  while (directMatch) {
    urls.add(directMatch[1]);
    directMatch = directRegex.exec(notes);
  }

  return [...urls];
};

const extractLocalUploadFileNamesFromNotes = (notes = "") => {
  const fileNames = new Set();
  const pattern = /\/uploads\/([a-zA-Z0-9._-]+)/g;
  let match = pattern.exec(notes);

  while (match) {
    fileNames.add(match[1]);
    match = pattern.exec(notes);
  }

  return fileNames;
};

const deleteImageFiles = (fileNames) => {
  fileNames.forEach((fileName) => {
    if (!fileName) {
      return;
    }

    try {
      const targetPath = path.join(uploadsDir, fileName);
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
    } catch (error) {
      console.error(`Failed to remove image file ${fileName}:`, error.message);
    }
  });
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

const normalizeLanguage = (value) => {
  const language = `${value || ""}`.toLowerCase().trim();
  return SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
};

const resolveLanguageFromHeader = (headerValue) => {
  if (!headerValue) {
    return DEFAULT_LANGUAGE;
  }

  const [firstChoice = ""] = headerValue.split(",");
  const [code = ""] = firstChoice.trim().split(";");
  const primaryCode = code.split("-")[0];
  return normalizeLanguage(primaryCode);
};

const applyTemplate = (template, values) =>
  template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => `${values[key] ?? ""}`);

const getTranslationsMap = async (client) => {
  const target = client || pool;
  const result = await target.query("SELECT translation_key, en_value, ru_value FROM translations");
  const map = new Map();

  result.rows.forEach((row) => {
    map.set(row.translation_key, {
      en: row.en_value || "",
      ru: row.ru_value || "",
    });
  });

  return map;
};

const getTranslationValue = (translationsMap, key, language) => {
  const row = translationsMap.get(key) || DEFAULT_TRANSLATIONS[key];
  if (!row) {
    return "";
  }

  return row[language] || row.en || "";
};

const updateUserNotificationLanguage = async (userId, language) => {
  const normalized = normalizeLanguage(language);
  await pool.query("UPDATE users SET notification_language = $1 WHERE id = $2", [normalized, userId]);
  return normalized;
};


const formatEventNotificationMessage = (event, timezone, language, translationsMap) => {
  const start = event.start_time ? new Date(event.start_time) : null;
  const safeTimezone = normalizeTimezone(timezone);
  const safeLanguage = normalizeLanguage(language);
  const now = new Date();
  const minutesToStart = start && !Number.isNaN(start.getTime()) ? Math.max(0, Math.ceil((start.getTime() - now.getTime()) / 60000)) : 0;
  const startLabel =
    start && !Number.isNaN(start.getTime())
      ? new Intl.DateTimeFormat(safeLanguage === "ru" ? "ru-RU" : "en-GB", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: safeTimezone,
        }).format(start)
      : getTranslationValue(translationsMap, "notification.event.unknownTime", safeLanguage);

  const template =
    getTranslationValue(translationsMap, "notification.event.reminder", safeLanguage) ||
    DEFAULT_TRANSLATIONS["notification.event.reminder"].en;

  return applyTemplate(template, {
    title: event.title,
    minutes: `${minutesToStart}`,
    notes: event.notes || getTranslationValue(translationsMap, "notification.event.noDescription", safeLanguage),
    startLabel,
    timezone: safeTimezone,
  });
};

const formatDailyNotificationMessage = (events, timezone, language, translationsMap) => {
  const safeTimezone = normalizeTimezone(timezone);
  const safeLanguage = normalizeLanguage(language);
  const locale = safeLanguage === "ru" ? "ru-RU" : "en-GB";
  const heading =
    getTranslationValue(translationsMap, "notification.daily.title", safeLanguage) ||
    DEFAULT_TRANSLATIONS["notification.daily.title"].en;
  const itemTemplate =
    getTranslationValue(translationsMap, "notification.daily.item", safeLanguage) ||
    DEFAULT_TRANSLATIONS["notification.daily.item"].en;

  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: safeTimezone,
  });

  const lines = events.map((event) =>
    applyTemplate(itemTemplate, {
      time: timeFormatter.format(new Date(event.start_time)),
      title: event.title,
    })
  );

  return `${heading}\n${lines.join("\n")}`;
};

const resolveTimezoneOffsetMs = (date, timezone) => {
  const timezoneDate = new Date(date.toLocaleString("en-US", { timeZone: timezone }));
  return timezoneDate.getTime() - date.getTime();
};

const getPeriodStartForTimezone = (currentDate, timezone) => {
  const localNow = new Date(currentDate.toLocaleString("en-US", { timeZone: timezone }));
  const localStart = new Date(localNow);
  localStart.setHours(10, 0, 0, 0);

  if (localNow < localStart) {
    localStart.setDate(localStart.getDate() - 1);
  }

  const offset = resolveTimezoneOffsetMs(currentDate, timezone);
  return new Date(localStart.getTime() - offset);
};

const shouldSendDailyNow = (currentDate, timezone) => {
  const localNow = new Date(currentDate.toLocaleString("en-US", { timeZone: timezone }));
  return localNow.getHours() === 10 && localNow.getMinutes() === 0;
};

const dispatchDailyAgendaNotifications = async () => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const settingsResult = await client.query("SELECT bot_token FROM telegram_settings WHERE id = 1");
    const botToken = settingsResult.rows[0]?.bot_token;

    if (!botToken) {
      await client.query("COMMIT");
      return;
    }

    const usersResult = await client.query(
      `SELECT id, telegram_chat_id, timezone, notification_language, daily_notifications_last_period_start
       FROM users
       WHERE is_approved = TRUE
         AND telegram_chat_id IS NOT NULL
         AND daily_notifications_enabled = TRUE`
    );

    const translationsMap = await getTranslationsMap(client);
    const now = new Date();

    for (const recipient of usersResult.rows) {
      const timezone = normalizeTimezone(recipient.timezone);
      if (!shouldSendDailyNow(now, timezone)) {
        continue;
      }

      const periodStart = getPeriodStartForTimezone(now, timezone);
      const previousPeriodStart = recipient.daily_notifications_last_period_start
        ? new Date(recipient.daily_notifications_last_period_start)
        : null;

      if (previousPeriodStart && previousPeriodStart.toISOString() === periodStart.toISOString()) {
        continue;
      }

      const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
      const eventsResult = await client.query(
        `SELECT title, start_time
         FROM events
         WHERE start_time >= $1
           AND start_time < $2
         ORDER BY start_time ASC`,
        [periodStart.toISOString(), periodEnd.toISOString()]
      );

      await client.query("UPDATE users SET daily_notifications_last_period_start = $1 WHERE id = $2", [
        periodStart.toISOString(),
        recipient.id,
      ]);

      if (!eventsResult.rows.length) {
        continue;
      }

      try {
        const message = formatDailyNotificationMessage(
          eventsResult.rows,
          timezone,
          recipient.notification_language,
          translationsMap
        );
        await sendTelegramMessage(botToken, recipient.telegram_chat_id, message);
      } catch (sendError) {
        console.error(`Telegram daily notification failed for user ${recipient.id}:`, sendError.message);
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to dispatch daily notifications:", error.message);
  } finally {
    client.release();
  }
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

    const translationsMap = await getTranslationsMap(client);

    for (const event of pendingResult.rows) {
      let recipientsQuery = null;
      let recipientsParams = [];

      if (event.telegram_notify_mode === "all") {
        recipientsQuery =
          "SELECT telegram_chat_id, timezone, notification_language FROM users WHERE is_approved = TRUE AND telegram_chat_id IS NOT NULL";
      } else if (event.telegram_notify_mode === "specific") {
        const userIds = Array.isArray(event.telegram_notify_user_ids) ? event.telegram_notify_user_ids : [];
        if (!userIds.length) {
          await client.query("UPDATE events SET telegram_notified_at = NOW() WHERE id = $1", [event.id]);
          continue;
        }

        recipientsQuery =
          "SELECT telegram_chat_id, timezone, notification_language FROM users WHERE is_approved = TRUE AND telegram_chat_id IS NOT NULL AND id = ANY($1::int[])";
        recipientsParams = [userIds];
      }

      if (!recipientsQuery) {
        await client.query("UPDATE events SET telegram_notified_at = NOW() WHERE id = $1", [event.id]);
        continue;
      }

      const recipientsResult = await client.query(recipientsQuery, recipientsParams);
      

      for (const recipient of recipientsResult.rows) {
        try {
          const imageUrls = extractImageUrlsFromNotes(event.notes || "");
          for (const url of imageUrls) {
            await sendTelegramPhoto(botToken, recipient.telegram_chat_id, url);
          }

          const message = formatEventNotificationMessage(
            event,
            recipient.timezone,
            recipient.notification_language,
            translationsMap
          );
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
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_language TEXT DEFAULT 'en'");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_notifications_enabled BOOLEAN DEFAULT FALSE");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_notifications_last_period_start TIMESTAMPTZ");
  await pool.query("UPDATE users SET notification_language = 'en' WHERE notification_language IS NULL OR notification_language = ''");
  await pool.query("UPDATE users SET timezone = 'UTC' WHERE timezone IS NULL OR timezone = ''");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS translations (
      translation_key TEXT PRIMARY KEY,
      en_value TEXT NOT NULL,
      ru_value TEXT NOT NULL DEFAULT ''
    )
  `);

  for (const [translationKey, values] of Object.entries(DEFAULT_TRANSLATIONS)) {
    await pool.query(
      `INSERT INTO translations (translation_key, en_value, ru_value)
       VALUES ($1, $2, $3)
       ON CONFLICT (translation_key) DO NOTHING`,
      [translationKey, values.en, values.ru]
    );
  }

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

app.get("/i18n/translations", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT translation_key, en_value, ru_value FROM translations ORDER BY translation_key ASC");
    return res.json({
      items: result.rows.map((row) => ({
        key: row.translation_key,
        en: row.en_value,
        ru: row.ru_value,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: "Unable to load translations" });
  }
});

app.get("/admin/translations/export", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT translation_key, en_value, ru_value FROM translations ORDER BY translation_key ASC");
    const rows = result.rows.map((row) => ({
      key: row.translation_key,
      en: row.en_value,
      ru: row.ru_value,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "translations");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="translations.xlsx"');
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({ error: "Unable to export translations" });
  }
});

app.post("/admin/translations/import", authMiddleware, adminMiddleware, upload.single("file"), async (req, res) => {
  if (!req.file?.buffer) {
    return res.status(400).json({ error: "Excel file is required" });
  }

  let rows = [];

  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ error: "Excel file has no sheets" });
    }

    rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
  } catch (error) {
    return res.status(400).json({ error: "Unable to parse Excel file" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const entry of rows) {
      const key = `${entry?.key || ""}`.trim();
      if (!key) {
        continue;
      }

      const en = `${entry?.en || ""}`;
      const ru = `${entry?.ru || ""}`;

      await client.query(
        `INSERT INTO translations (translation_key, en_value, ru_value)
         VALUES ($1, $2, $3)
         ON CONFLICT (translation_key)
         DO UPDATE SET en_value = EXCLUDED.en_value, ru_value = EXCLUDED.ru_value`,
        [key, en, ru]
      );
    }

    await client.query("COMMIT");
    return res.status(204).send();
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "Unable to import translations" });
  } finally {
    client.release();
  }
});

app.post("/auth/register", async (req, res) => {
  const { email, password, timezone, language } = req.body;

  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: "Email and password (min 6 chars) are required" });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedTimezone = normalizeTimezone(timezone);
  const normalizedLanguage = normalizeLanguage(language || req.headers["x-ui-language"] || resolveLanguageFromHeader(req.headers["accept-language"]));

  try {
    const userCountResult = await pool.query("SELECT COUNT(*)::int AS count FROM users");
    const isFirstUser = userCountResult.rows[0].count === 0;

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin, is_approved, timezone, notification_language)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, is_admin, is_approved, timezone`,
      [normalizedEmail, passwordHash, isFirstUser, isFirstUser, normalizedTimezone, normalizedLanguage]
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

    const requestedLanguage = normalizeLanguage(req.body?.language || req.headers["x-ui-language"] || resolveLanguageFromHeader(req.headers["accept-language"]));
    if (requestedLanguage !== normalizeLanguage(user.notification_language)) {
      await updateUserNotificationLanguage(user.id, requestedLanguage);
    }

    const token = issueToken(user);
    res.cookie(COOKIE_NAME, token, buildAuthCookieOptions());
    return res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ error: "Unable to login" });
  }
});

app.get("/auth/me", authMiddleware, async (req, res) => {
  const requestedLanguage = normalizeLanguage(req.headers["x-ui-language"] || resolveLanguageFromHeader(req.headers["accept-language"]));
  await updateUserNotificationLanguage(req.user.id, requestedLanguage);

  const result = await pool.query(
    "SELECT id, email, is_admin, is_approved, created_at, telegram_chat_id, timezone, daily_notifications_enabled FROM users WHERE id = $1",
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
      "SELECT id, email, is_admin, is_approved, created_at, telegram_chat_id, timezone, daily_notifications_enabled FROM users ORDER BY created_at ASC"
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
         RETURNING id, email, is_admin, is_approved, created_at, telegram_chat_id, timezone, daily_notifications_enabled`,
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
       RETURNING id, email, is_admin, is_approved, created_at, telegram_chat_id, timezone, daily_notifications_enabled`,
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

    const previousEventResult = await pool.query("SELECT notes FROM events WHERE id = $1", [id]);
    if (!previousEventResult.rows.length) {
      return res.status(404).json({ error: "Event not found" });
    }

    const previousImages = extractLocalUploadFileNamesFromNotes(previousEventResult.rows[0]?.notes || "");
    const nextImages = extractLocalUploadFileNamesFromNotes(notes || "");

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

    const removedImages = [...previousImages].filter((name) => !nextImages.has(name));
    deleteImageFiles(removedImages);

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

    const previousEventResult = await pool.query("SELECT notes FROM events WHERE id = $1", [id]);
    if (!previousEventResult.rows.length) {
      return res.status(404).json({ error: "Event not found" });
    }

    const result = await pool.query("DELETE FROM events WHERE id = $1 RETURNING id", [id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: "Event not found" });
    }

    const imagesToDelete = extractLocalUploadFileNamesFromNotes(previousEventResult.rows[0]?.notes || "");
    deleteImageFiles(imagesToDelete);

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Unable to delete event" });
  }
});

app.post("/events/attachments", authMiddleware, upload.single("image"), async (req, res) => {
  if (!req.file?.buffer) {
    return res.status(400).json({ error: "Image file is required" });
  }

  if (!req.file.mimetype?.startsWith("image/")) {
    return res.status(400).json({ error: "Only image files are allowed" });
  }

  try {
    const userResult = await pool.query("SELECT is_approved FROM users WHERE id = $1", [req.user.id]);
    if (!userResult.rows.length || !userResult.rows[0].is_approved) {
      return res.status(403).json({ error: "User is not approved" });
    }

    const extension = (req.file.mimetype.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "") || "png";
    const fileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, req.file.buffer);

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    return res.status(201).json({ url: `${baseUrl}/uploads/${fileName}` });
  } catch (error) {
    return res.status(500).json({ error: "Unable to upload image" });
  }
});

app.post("/admin/events/cleanup-old-images", authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const pastEventsResult = await client.query(
      `SELECT id, notes
       FROM events
       WHERE end_time IS NOT NULL
         AND end_time < NOW()`
    );

    let updatedEventsCount = 0;
    let deletedImagesCount = 0;

    for (const entry of pastEventsResult.rows) {
      const notes = entry.notes || "";
      const images = [...extractLocalUploadFileNamesFromNotes(notes)];

      if (!images.length) {
        continue;
      }

      const nextNotes = notes.replace(/!?\[[^\]]*\]\((?:https?:\/\/[^)\s]*\/)?uploads\/[a-zA-Z0-9._-]+\)\s*/g, "").trim();

      await client.query("UPDATE events SET notes = $1 WHERE id = $2", [nextNotes, entry.id]);
      deleteImageFiles(images);

      updatedEventsCount += 1;
      deletedImagesCount += images.length;
    }

    await client.query("COMMIT");
    return res.json({ updatedEventsCount, deletedImagesCount });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "Unable to clean up old event images" });
  } finally {
    client.release();
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
      "UPDATE users SET timezone = $1 WHERE id = $2 RETURNING id, email, is_admin, is_approved, created_at, telegram_chat_id, timezone, daily_notifications_enabled",
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
      pool.query("SELECT telegram_chat_id, telegram_subscription_token, daily_notifications_enabled FROM users WHERE id = $1", [req.user.id]),
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
      dailyNotificationsEnabled: Boolean(userData?.daily_notifications_enabled),
    });
  } catch (error) {
    return res.status(500).json({ error: "Unable to load Telegram settings" });
  }
});

app.put("/user/daily-notifications", authMiddleware, async (req, res) => {
  const enabled = Boolean(req.body?.enabled);

  try {
    const result = await pool.query(
      "UPDATE users SET daily_notifications_enabled = $1, daily_notifications_last_period_start = NULL WHERE id = $2 RETURNING daily_notifications_enabled",
      [enabled, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ enabled: Boolean(result.rows[0].daily_notifications_enabled) });
  } catch (error) {
    return res.status(500).json({ error: "Unable to update daily notifications setting" });
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

    const translationsMap = await getTranslationsMap();
    const languageResult = await pool.query("SELECT notification_language FROM users WHERE id = $1", [req.user.id]);
    const userLanguage = normalizeLanguage(languageResult.rows[0]?.notification_language);
    const connectedText =
      getTranslationValue(translationsMap, "notification.telegram.connected", userLanguage) ||
      DEFAULT_TRANSLATIONS["notification.telegram.connected"].en;

    await sendTelegramMessage(settings.bot_token, chatId, connectedText);

    return res.json({ linked: true, status: "Connected" });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unable to verify Telegram subscription" });
  }
});

initDb()
  .then(() => {
    setInterval(() => {
      dispatchPendingEventNotifications();
      dispatchDailyAgendaNotifications();
    }, 60 * 1000);

    dispatchPendingEventNotifications();
    dispatchDailyAgendaNotifications();

    app.listen(PORT, () => {
      console.log(`Backend running on ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database", error);
    process.exit(1);
  });
