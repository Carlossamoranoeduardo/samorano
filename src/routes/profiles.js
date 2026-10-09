
const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const cloudinary = require("../services/cloudinary");
const multer = require("multer");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return cb(new Error("Envie uma imagem JPG, PNG ou WebP."));
    }
    cb(null, true);
  }
});

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.samorano_token;

    if (!token) {
      return res.status(401).json({ error: "Faça login para continuar." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "samorano"
    });

    const result = await pool.query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [decoded.sub]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: "Sessão inválida." });
    }

    req.user = result.rows[0];
    next();
  } catch {
    return res.status(401).json({ error: "Sessão inválida ou expirada." });
  }
}

function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "samorano/avatars", resource_type: "image" },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

// Consultar o perfil
router.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email,
              p.username, p.avatar_url, p.bio
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    const profile = result.rows[0];

    res.json({
      profile: {
        ...profile,
        username: profile.username || "",
        avatar_url: profile.avatar_url || "",
        bio: profile.bio || ""
      }
    });
  } catch (error) {
    console.error("Erro ao consultar perfil:", error.message);
    res.status(500).json({ error: "Não foi possível carregar o perfil." });
  }
});

// Atualizar nome de usuário e biografia
router.put("/me", requireAuth, async (req, res) => {
  try {
    const username = req.body?.username;
    const bio = req.body?.bio;

    if (typeof username !== "string" ||
        !/^[a-zA-Z0-9_.]{3,30}$/.test(username.trim())) {
      return res.status(400).json({
        error: "O nome de usuário deve ter 3 a 30 caracteres: letras, números, ponto ou sublinhado."
      });
    }

    if (typeof bio !== "string" || bio.length > 300) {
      return res.status(400).json({
        error: "A biografia deve ter no máximo 300 caracteres."
      });
    }

    const result = await pool.query(
      `INSERT INTO profiles (user_id, username, bio, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET username = EXCLUDED.username,
                     bio = EXCLUDED.bio,
                     updated_at = NOW()
       RETURNING username, bio, avatar_url`,
      [req.user.id, username.trim().toLowerCase(), bio.trim()]
    );

    res.json({
      message: "Perfil atualizado!",
      profile: result.rows[0]
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "Esse nome de usuário já está sendo usado."
      });
    }

    console.error("Erro ao salvar perfil:", error.message);
    res.status(500).json({ error: "Não foi possível salvar o perfil." });
  }
});

// Atualizar foto de perfil
router.put("/me/avatar", requireAuth, upload.single("avatar"), async (req, res) => {
  let uploadedImage;

  try {
    if (!req.file) {
      return res.status(400).json({ error: "Selecione uma foto." });
    }

    uploadedImage = await uploadToCloudinary(req.file.buffer);

    const result = await pool.query(
      `INSERT INTO profiles (user_id, avatar_url, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET avatar_url = EXCLUDED.avatar_url,
                     updated_at = NOW()
       RETURNING avatar_url`,
      [req.user.id, uploadedImage.secure_url]
    );

    res.json({
      message: "Foto de perfil atualizada!",
      avatar_url: result.rows[0].avatar_url
    });
  } catch (error) {
    if (uploadedImage?.public_id) {
      try {
        await cloudinary.uploader.destroy(uploadedImage.public_id);
      } catch {}
    }

    console.error("Erro ao atualizar foto:", error.message);
    res.status(500).json({ error: "Não foi possível atualizar a foto." });
  }
});

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      error: error.code === "LIMIT_FILE_SIZE"
        ? "A foto deve ter no máximo 5 MB."
        : "Não foi possível processar a imagem."
    });
  }

  if (error) return res.status(400).json({ error: error.message });
  next();
});

module.exports = router;
