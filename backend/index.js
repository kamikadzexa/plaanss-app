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

const issueToken = (user) => jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });

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
  start: row.start_time,
  end: row.end_time,
  allDay: row.all_day,
  notes: row.notes || "",
});

const sanitizeUser = (row) => ({
  id: row.id,
  email: row.email,
  isAdmin: row.is_admin,
  isApproved: row.is_approved,
  createdAt: row.created_at,
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

  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE");

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
  const { email, password } = req.body;

  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: "Email and password (min 6 chars) are required" });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const userCountResult = await pool.query("SELECT COUNT(*)::int AS count FROM users");
    const isFirstUser = userCountResult.rows[0].count === 0;

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin, is_approved)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, is_admin, is_approved`,
      [normalizedEmail, passwordHash, isFirstUser, isFirstUser]
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
    return res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ error: "Unable to login" });
  }
});

app.get("/auth/me", authMiddleware, async (req, res) => {
  const result = await pool.query("SELECT id, email, is_admin, is_approved, created_at FROM users WHERE id = $1", [req.user.id]);
  const user = result.rows[0];

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (!user.is_approved) {
    return res.status(403).json({ error: "User is not approved" });
  }

  return res.json({ user: sanitizeUser(user) });
});

app.get("/admin/users", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, email, is_admin, is_approved, created_at FROM users ORDER BY created_at ASC"
    );
    return res.json({ users: result.rows.map(sanitizeUser) });
  } catch (error) {
    return res.status(500).json({ error: "Unable to fetch users" });
  }
});

app.put("/admin/users/:id", authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { email, password, isAdmin, isApproved } = req.body;

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
             password_hash = $4
         WHERE id = $5
         RETURNING id, email, is_admin, is_approved, created_at`,
        [normalizedEmail, Boolean(isAdmin), Boolean(isApproved), passwordHash, id]
      );
      return res.json({ user: sanitizeUser(result.rows[0]) });
    }

    const result = await pool.query(
      `UPDATE users
       SET email = $1,
           is_admin = $2,
           is_approved = $3
       WHERE id = $4
       RETURNING id, email, is_admin, is_approved, created_at`,
      [normalizedEmail, Boolean(isAdmin), Boolean(isApproved), id]
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
    const userResult = await pool.query("SELECT is_approved FROM users WHERE id = $1", [req.user.id]);
    if (!userResult.rows.length || !userResult.rows[0].is_approved) {
      return res.status(403).json({ error: "User is not approved" });
    }

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
    const userResult = await pool.query("SELECT is_approved FROM users WHERE id = $1", [req.user.id]);
    if (!userResult.rows.length || !userResult.rows[0].is_approved) {
      return res.status(403).json({ error: "User is not approved" });
    }

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
    const userResult = await pool.query("SELECT is_approved FROM users WHERE id = $1", [req.user.id]);
    if (!userResult.rows.length || !userResult.rows[0].is_approved) {
      return res.status(403).json({ error: "User is not approved" });
    }

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
