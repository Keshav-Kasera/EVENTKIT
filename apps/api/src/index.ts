import "./lib/env";
import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import multer from "multer";
import { Server as SocketIOServer } from "socket.io";
import jwt from "jsonwebtoken";
import { authRouter } from "./routes/auth";
import { catalogRouter } from "./routes/catalog";
import { rfqRouter } from "./routes/rfqs";
import { quotationRouter } from "./routes/quotations";
import { bookingRouter } from "./routes/bookings";
import { adminRouter } from "./routes/admin";
import { authenticate, getJwtSecret } from "./middleware/auth";
import { registerSocketIO } from "./lib/audit";
import { startWatchdogDaemon } from "./services/watchdog";
import { prisma } from "./lib/prisma";

const app = express();
const server = http.createServer(app);

const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim());

const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next();
  try {
    const decoded = jwt.verify(String(token), getJwtSecret()) as { id: string };
    socket.data.userId = decoded.id;
  } catch {
    // Allow anonymous connection for global public events if needed
  }
  return next();
});

io.on("connection", (socket) => {
  if (socket.data.userId) {
    socket.join(`user:${socket.data.userId}`);
  }
});

registerSocketIO(io);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        return cb(null, true);
      }
      return cb(new Error("CORS blocked by origin policy"));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "6mb" }));
app.use(morgan("dev"));

// Cloud-safe memory upload returning compact Data URI (prevents ephemeral filesystem data loss on free tiers)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

app.post("/api/uploads", authenticate, upload.single("file") as unknown as express.RequestHandler, (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const base64 = req.file.buffer.toString("base64");
  const dataUrl = `data:${req.file.mimetype};base64,${base64}`;
  return res.status(201).json({
    url: dataUrl,
    fileName: req.file.originalname,
    mimeType: req.file.mimetype,
  });
});

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ status: "ok", db: "connected", timestamp: new Date().toISOString() });
  } catch {
    return res.status(503).json({ status: "degraded", db: "disconnected" });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api/rfqs", rfqRouter);
app.use("/api/quotations", quotationRouter);
app.use("/api/bookings", bookingRouter);
app.use("/api/admin", adminRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled API error:", err);
  return res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT || 4000);

if (process.env.NODE_ENV !== "test") {
  server.listen(port, () => {
    console.log(`EventKit API & Watchdog running on port ${port}`);
    startWatchdogDaemon(60_000);
  });
}

export { app, server };
