
const express = require("express");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const cloudinary = require("../services/cloudinary");
const pool = require("../db");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];

    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Envie uma imagem JPG, PNG ou WebP."));
    }

    cb(null, true);
  }
});

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.samorano_token;

    if (!token) {
      return res.status(401).json({
        error: "Faça login para continuar."
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "samorano"
    });

    const result = await pool.query(
      "SELECT id, name FROM users WHERE id = $1",
      [decoded.sub]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: "Sessão inválida." });
    }

    req.user = result.rows[0];
    next();
  } catch {
    return res.status(401).json({
      error: "Sessão inválida ou expirada."
    });
  }
}

function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "samorano/posts",
        resource_type: "image"
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    stream.end(buffer);
  });
}

// Listar publicações com curtidas
router.get("/", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        posts.id,
        posts.user_id,
        users.name,
        posts.image_url,
        posts.caption,
        posts.created_at,
        COUNT(DISTINCT likes.user_id)::int AS likes_count,
        EXISTS (
          SELECT 1
          FROM likes AS my_like
          WHERE my_like.post_id = posts.id
            AND my_like.user_id = $1
        ) AS liked_by_me
       FROM posts
       JOIN users ON users.id = posts.user_id
       LEFT JOIN likes ON likes.post_id = posts.id
       GROUP BY posts.id, users.name
       ORDER BY posts.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    res.json({ posts: result.rows });
  } catch (error) {
    console.error("Erro ao carregar publicações:", error.message);
    res.status(500).json({
      error: "Não foi possível carregar as publicações."
    });
  }
});

// Publicar foto
router.post("/", requireAuth, upload.single("photo"), async (req, res) => {
  let uploadedImage;

  try {
    if (!req.file) {
      return res.status(400).json({
        error: "Selecione uma foto antes de publicar."
      });
    }

    const caption = typeof req.body.caption === "string"
      ? req.body.caption.trim()
      : "";

    if (caption.length > 2200) {
      return res.status(400).json({
        error: "A legenda pode ter no máximo 2200 caracteres."
      });
    }

    uploadedImage = await uploadToCloudinary(req.file.buffer);

    const result = await pool.query(
      `INSERT INTO posts (user_id, image_url, caption)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, image_url, caption, created_at`,
      [req.user.id, uploadedImage.secure_url, caption]
    );

    res.status(201).json({
      message: "Foto publicada com sucesso!",
      post: {
        ...result.rows[0],
        name: req.user.name,
        likes_count: 0,
        liked_by_me: false
      }
    });
  } catch (error) {
    if (uploadedImage?.public_id) {
      try {
        await cloudinary.uploader.destroy(uploadedImage.public_id);
      } catch (cleanupError) {
        console.error("Falha ao limpar imagem:", cleanupError.message);
      }
    }

    console.error("Erro ao publicar:", error.message);
    res.status(500).json({
      error: "Não foi possível publicar a foto."
    });
  }
});

// Curtir ou remover curtida
router.post("/:id/like", requireAuth, async (req, res) => {
  try {
    const postId = Number(req.params.id);

    if (!Number.isSafeInteger(postId) || postId < 1) {
      return res.status(400).json({ error: "Publicação inválida." });
    }

    const result = await pool.query(
      `INSERT INTO likes (user_id, post_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, post_id) DO NOTHING
       RETURNING post_id`,
      [req.user.id, postId]
    );

    if (!result.rowCount) {
      await pool.query(
        "DELETE FROM likes WHERE user_id = $1 AND post_id = $2",
        [req.user.id, postId]
      );

      return res.json({
        liked: false,
        message: "Curtida removida."
      });
    }

    res.json({
      liked: true,
      message: "Você curtiu a publicação!"
    });
  } catch (error) {
    if (error.code === "23503") {
      return res.status(404).json({
        error: "Publicação não encontrada."
      });
    }

    console.error("Erro na curtida:", error.message);
    res.status(500).json({
      error: "Não foi possível registrar a curtida."
    });
  }
});

// Carregar comentários
router.get("/:id/comments", async (req, res) => {
  try {
    const postId = Number(req.params.id);

    if (!Number.isSafeInteger(postId) || postId < 1) {
      return res.status(400).json({ error: "Publicação inválida." });
    }

    const result = await pool.query(
      `SELECT comments.id, comments.content, comments.created_at,
              users.name
       FROM comments
       JOIN users ON users.id = comments.user_id
       WHERE comments.post_id = $1
       ORDER BY comments.created_at ASC
       LIMIT 100`,
      [postId]
    );

    res.json({ comments: result.rows });
  } catch (error) {
    console.error("Erro ao carregar comentários:", error.message);
    res.status(500).json({
      error: "Não foi possível carregar os comentários."
    });
  }
});

// Criar comentário
router.post("/:id/comments", requireAuth, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const content = req.body?.content;

    if (!Number.isSafeInteger(postId) || postId < 1) {
      return res.status(400).json({ error: "Publicação inválida." });
    }

    if (
      typeof content !== "string" ||
      !content.trim() ||
      content.trim().length > 1000
    ) {
      return res.status(400).json({
        error: "Digite um comentário de 1 a 1000 caracteres."
      });
    }

    const post = await pool.query(
      "SELECT id FROM posts WHERE id = $1",
      [postId]
    );

    if (!post.rows.length) {
      return res.status(404).json({
        error: "Publicação não encontrada."
      });
    }

    const result = await pool.query(
      `INSERT INTO comments (user_id, post_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, content, created_at`,
      [req.user.id, postId, content.trim()]
    );

    res.status(201).json({
      message: "Comentário publicado!",
      comment: {
        ...result.rows[0],
        name: req.user.name
      }
    });
  } catch (error) {
    console.error("Erro ao publicar comentário:", error.message);
    res.status(500).json({
      error: "Não foi possível publicar o comentário."
    });
  }
});

// Tratar erros de upload
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "A imagem deve ter no máximo 8 MB."
      : "Não foi possível processar o arquivo enviado.";

    return res.status(400).json({ error: message });
  }

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  next();
});

module.exports = router;
