import { Router } from "express";
import { searchMercariProducts } from "../controllers/marketplaceSearchController.js";

const router = Router();

router.get("/", searchMercariProducts);

export default router;
