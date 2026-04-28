import path from "path";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { fileURLToPath } from "url";

import { connectDb } from "./config/db.js";
import aiShoppingSearchRoutes from "./routes/aiShoppingSearchRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import marketplaceSearchRoutes from "./routes/marketplaceSearchRoutes.js";
import mercariSearchRoutes from "./routes/mercariSearchRoutes.js";
import previewProductRoutes from "./routes/previewProductRoutes.js";
import productPreviewRoutes from "./routes/productPreviewRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import proxyRequestRoutes from "./routes/proxyRequestRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { ensureSeedData } from "./utils/seed.js";

// =======================
// PATH SETUP
// =======================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env (IMPORTANT: keep simple and reliable)
dotenv.config();

// =======================
// APP SETUP
// =======================
const app = express();

// Allow frontend (PC + phone + local dev)
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
  "http://127.0.0.1:5173"
].filter(Boolean);

// =======================
// CORS FIX (IMPORTANT)
// =======================
app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (mobile apps / postman)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(null, true); // DEV MODE: allow everything on LAN
    },
    credentials: true
  })
);

// =======================
// MIDDLEWARE
// =======================
app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));

// =======================
// ROUTES
// =======================
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/ai-shopping-search", aiShoppingSearchRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/mercari-search", mercariSearchRoutes);
app.use("/api/marketplace-search", marketplaceSearchRoutes);
app.use("/api/preview-product", previewProductRoutes);
app.use("/api/product", productPreviewRoutes);
app.use("/api/users", userRoutes);
app.use("/api/proxy-requests", proxyRequestRoutes);

// =======================
// ERROR HANDLERS
// =======================
app.use(notFound);
app.use(errorHandler);

// =======================
// SERVER START (IMPORTANT FIX)
// =======================
const port = process.env.PORT || 5000;

const start = async () => {
  try {
    await connectDb();
    await ensureSeedData();

    // 🔥 CRITICAL FIX: allow phone access
    app.listen(port, "0.0.0.0", () => {
      console.log(`API running on http://0.0.0.0:${port}`);
    });
  } catch (error) {
    console.error("Failed to start API", error);
    process.exit(1);
  }
};

start();
