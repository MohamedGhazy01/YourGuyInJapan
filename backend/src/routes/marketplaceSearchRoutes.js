import { Router } from "express";
import { searchMarketplaceProducts } from "../controllers/marketplaceSearchController.js";

const router = Router();

router.get("/", searchMarketplaceProducts);

export default router;
