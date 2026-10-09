


require("dotenv").config();
const cookieParser = require("cookie-parser");
const express = require("express");
const http = require("http");
const path = require("path");
const helmet = require("helmet");
const compression = require("compression");
const { Server } = require("socket.io");

if (!process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32 ||
    process.env.JWT_SECRET.includes("SUBSTITUA")) {
  throw new Error("Configure um JWT_SECRET forte no arquivo .env");
}

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use(cookieParser());


app.use(express.static(path.join(__dirname, "public")));

app.use("/api/auth", require("./src/routes/auth"));
app.use("/api/posts", require("./src/routes/posts"));
app.use("/api/profiles", require("./src/routes/profiles"));

const io = new Server(server);

io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);
});

app.get("/api/health", (req, res) => {
  res.json({
    app: "Samorano",
    status: "online"
  });
});

app.get("/api/config", (req, res) => {
  res.json({
    appName: "Samorano",
    features: {
      profiles: true,
      photos: true,
      chat: true,
      stories: true
    }
  });
});

app.use((req, res) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("================================");
  console.log("       SAMORANO ONLINE");
  console.log(`Servidor: http://localhost:${PORT}`);
  console.log("================================");
});
