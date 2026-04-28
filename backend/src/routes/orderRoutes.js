import { Router } from "express";
import {
  completeDraftOrder,
  createOrder,
  createMarketplaceDraftOrder,
  estimateShipping,
  getAllOrders,
  getOrderById,
  getMyOrders,
  trackOrder,
  updateOrderStatus
} from "../controllers/orderController.js";
import { adminOnly, protect } from "../middleware/auth.js";

const router = Router();

router.post("/estimate-shipping", estimateShipping);
router.post("/", protect, createOrder);
router.post("/marketplace-draft", protect, createMarketplaceDraftOrder);
router.get("/mine", protect, getMyOrders);
router.get("/", protect, adminOnly, getAllOrders);
router.get("/:id", protect, getOrderById);
router.post("/:id/complete", protect, completeDraftOrder);
router.get("/track/:orderNumber", trackOrder);
router.put("/:id/status", protect, adminOnly, updateOrderStatus);

export default router;
