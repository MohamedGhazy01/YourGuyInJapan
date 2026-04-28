import { Router } from "express";
import { aiShoppingSearch } from "../controllers/aiShoppingSearchController.js";

const router = Router();

router.post("/", aiShoppingSearch);

export default router;
