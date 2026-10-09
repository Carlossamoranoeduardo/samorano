
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("A variável DATABASE_URL não foi configurada no .env");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000
});

pool.on("error", (err) => {
  console.error("Erro inesperado na conexão com o Neon:", err.message);
});

module.exports = pool;
