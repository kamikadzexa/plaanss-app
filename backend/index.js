require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

app.use(cors());
app.use(express.json());

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

const sanitizeEvent = (row) => ({
  id: row.id,
  title: row.title,
  start: row.start_time,
  end: row.end_time,
  allDay: row.all_day,
  notes: row.notes || "",
});

const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP,
      all_day BOOLEAN DEFAULT FALSE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
};

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (error) {
    res.status(500).json({ status: "error", details: "Database unavailable" });
  }
});

app.post("/auth/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: "Email and password (min 6 chars) are required" });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email.toLowerCase(), passwordHash]
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });

    return res.status(201).json({ token, user });
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
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });

    return res.json({ token, user: { id: user.id, email: user.email } });
  } catch (error) {
    return res.status(500).json({ error: "Unable to login" });
  }
});

app.get("/auth/me", authMiddleware, async (req, res) => {
  const result = await pool.query("SELECT id, email FROM users WHERE id = $1", [req.user.id]);
  const user = result.rows[0];

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.json({ user });
});

app.get("/events", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, title, start_time, end_time, all_day, notes FROM events WHERE user_id = $1 ORDER BY start_time ASC",
      [req.user.id]
    );

    return res.json({ events: result.rows.map(sanitizeEvent) });
  } catch (error) {
    return res.status(500).json({ error: "Unable to fetch events" });
  }
});

app.post("/events", authMiddleware, async (req, res) => {
  const { title, start, end, allDay, notes } = req.body;

  if (!title || !start) {
    return res.status(400).json({ error: "Event title and start are required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO events (user_id, title, start_time, end_time, all_day, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, start_time, end_time, all_day, notes`,
      [req.user.id, title.trim(), start, end || null, Boolean(allDay), notes || ""]
    );

    return res.status(201).json({ event: sanitizeEvent(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ error: "Unable to create event" });
  }
});

app.put("/events/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { title, start, end, allDay, notes } = req.body;

  if (!title || !start) {
    return res.status(400).json({ error: "Event title and start are required" });
  }

  try {
    const result = await pool.query(
      `UPDATE events
       SET title = $1, start_time = $2, end_time = $3, all_day = $4, notes = $5
       WHERE id = $6 AND user_id = $7
       RETURNING id, title, start_time, end_time, all_day, notes`,
      [title.trim(), start, end || null, Boolean(allDay), notes || "", id, req.user.id]
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
    const result = await pool.query("DELETE FROM events WHERE id = $1 AND user_id = $2 RETURNING id", [id, req.user.id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: "Event not found" });
    }

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Unable to delete event" });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend running on ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database", error);
    process.exit(1);
  });
