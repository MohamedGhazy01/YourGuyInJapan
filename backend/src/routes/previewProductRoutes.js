import { Router } from "express";
import { previewProduct } from "../controllers/previewProductController.js";
import { protect } from "../middleware/auth.js";

const router = Router();

router.get("/", protect, previewProduct);

export default router;
