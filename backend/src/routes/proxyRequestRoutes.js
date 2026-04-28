import { Router } from "express";
import {
  continueOrderingFromProxyRequest,
  createOrderFromProxyRequest,
  createProxyRequest,
  generateProxyRequestDraft,
  getAllProxyRequests,
  getMyProxyRequests,
  getProxyRequestCheckout,
  updateProxyRequestStatus
} from "../controllers/proxyRequestController.js";
import { adminOnly, protect } from "../middleware/auth.js";

const router = Router();

router.post("/", protect, createProxyRequest);
router.post("/ai-draft", protect, generateProxyRequestDraft);
router.get("/me", protect, getMyProxyRequests);
router.get("/", protect, adminOnly, getAllProxyRequests);
router.get("/:id/checkout", protect, getProxyRequestCheckout);
router.post("/:id/continue-ordering", protect, continueOrderingFromProxyRequest);
router.post("/:id/order", protect, createOrderFromProxyRequest);
router.put("/:id", protect, adminOnly, updateProxyRequestStatus);

export default router;
