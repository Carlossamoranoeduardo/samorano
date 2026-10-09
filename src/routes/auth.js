

const cookieParser = require("cookie-parser");

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const pool = require("../db");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde 15 minutos." }
});

function validEmail(email) {
  return typeof email === "string" &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createToken(user) {
  return jwt.sign(
    { sub: String(user.id), email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d", issuer: "samorano" }
  );
}

function setAuthCookie(res, token) {
  res.cookie("samorano_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

router.get("/me", async (req, res) => {
  try {
    const token = req.cookies?.samorano_token;

    if (!token) {
      return res.status(401).json({ error: "Faça login." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "samorano"
    });

    const result = await pool.query(
      `SELECT id, name, email FROM users WHERE id = $1`,
      [decoded.sub]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: "Sessão inválida." });
    }

    res.json({ user: result.rows[0] });
  } catch {
    res.status(401).json({ error: "Sessão inválida ou expirada." });
  }
});


router.post("/register", authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (typeof name !== "string" ||
        name.trim().length < 2 ||
        name.trim().length > 80) {
      return res.status(400).json({
        error: "Informe um nome entre 2 e 80 caracteres."
      });
    }

    if (!validEmail(email)) {
      return res.status(400).json({ error: "E-mail inválido." });
    }

    if (typeof password !== "string" ||
        password.length < 8 ||
        Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({
        error: "A senha deve ter entre 8 caracteres e 72 bytes."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [name.trim(), normalizedEmail, passwordHash]
    );

    const user = result.rows[0];

    await pool.query(
      "INSERT INTO profiles (user_id) VALUES ($1)",
      [user.id]
    );

    setAuthCookie(res, createToken(user));

    return res.status(201).json({
      message: "Conta criada com sucesso!",
      user
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({
        error: "Este e-mail já está cadastrado."
      });
    }

    console.error("Erro no cadastro:", err.message);
    return res.status(500).json({
      error: "Não foi possível criar a conta."
    });
  }
});

router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!validEmail(email) ||
        typeof password !== "string" ||
        password.length === 0 ||
        Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({
        error: "Informe um e-mail e uma senha válidos."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const result = await pool.query(
      `SELECT id, name, email, password_hash
       FROM users WHERE email = $1`,
      [normalizedEmail]
    );

    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        error: "E-mail ou senha incorretos."
      });
    }

    setAuthCookie(res, createToken(user));

    return res.json({
      message: "Login realizado com sucesso!",
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    console.error("Erro no login:", err.message);
    return res.status(500).json({
      error: "Não foi possível entrar na conta."
    });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("samorano_token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });

  res.json({ message: "Você saiu da sua conta." });
});

module.exports = router;
