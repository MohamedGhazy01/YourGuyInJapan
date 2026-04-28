import { Router } from "express";
import { previewProductForCreate } from "../controllers/productPreviewController.js";
import { adminOnly, protect } from "../middleware/auth.js";

const router = Router();

router.get("/preview", protect, adminOnly, previewProductForCreate);

export default router;
