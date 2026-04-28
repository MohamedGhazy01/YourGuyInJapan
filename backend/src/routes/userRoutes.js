import { Router } from "express";
import { getDashboardStats, getUsers, getWishlist, toggleWishlist } from "../controllers/userController.js";
import { adminOnly, protect } from "../middleware/auth.js";

const router = Router();

router.get("/wishlist", protect, getWishlist);
router.post("/wishlist", protect, toggleWishlist);
router.get("/", protect, adminOnly, getUsers);
router.get("/dashboard/stats", protect, adminOnly, getDashboardStats);

export default router;

