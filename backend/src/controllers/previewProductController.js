import asyncHandler from "express-async-handler";
import { extractProductPreview } from "../utils/productPreview.js";

const isValidUrl = (value = "") => {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};

export const previewProduct = asyncHandler(async (req, res) => {
  const url = String(req.query?.url || "").trim();

  if (!url) {
    res.status(400);
    throw new Error("Product URL is required");
  }

  if (!isValidUrl(url)) {
    res.status(400);
    throw new Error("Please provide a valid product URL");
  }

  try {
    const preview = await extractProductPreview(url);
    res.json(preview);
  } catch (error) {
    res.status(422);
    throw new Error(error.message || "Product preview could not be loaded");
  }
});
