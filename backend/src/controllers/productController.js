import asyncHandler from "express-async-handler";
import { Product } from "../models/Product.js";
import { convertFromJPY } from "../utils/currency.js";
import { getMarketplacePolicy } from "../utils/marketplaceRules.js";

const normalizeProduct = (product, currency) => {
  const marketplace = getMarketplacePolicy({
    source: product.source,
    sourceUrl: product.sourceUrl
  });

  return {
    ...product.toObject(),
    source: marketplace.source,
    checkoutAction: marketplace.checkoutAction,
    checkoutLabel: marketplace.checkoutLabel,
    requiresProxyApproval: marketplace.requiresProxyApproval,
    canCheckoutNow: marketplace.canCheckoutNow,
    price: convertFromJPY(product.priceJPY, currency),
    compareAtPrice: product.compareAtPriceJPY ? convertFromJPY(product.compareAtPriceJPY, currency) : null,
    currency
  };
};

export const getProducts = asyncHandler(async (req, res) => {
  const {
    search = "",
    category,
    featured,
    sort = "featured",
    minPrice,
    maxPrice,
    currency = process.env.DEFAULT_CURRENCY || "USD"
  } = req.query;

  const query = {};

  if (search) query.title = { $regex: search, $options: "i" };
  if (category && category !== "all") query.category = category;
  if (featured === "true") query.featured = true;
  if (minPrice || maxPrice) {
    query.priceJPY = {};
    if (minPrice) query.priceJPY.$gte = Number(minPrice);
    if (maxPrice) query.priceJPY.$lte = Number(maxPrice);
  }

  const sortMap = {
    newest: { createdAt: -1 },
    priceAsc: { priceJPY: 1 },
    priceDesc: { priceJPY: -1 },
    rating: { ratingAverage: -1 },
    featured: { featured: -1, createdAt: -1 }
  };

  const products = await Product.find(query).sort(sortMap[sort] || sortMap.featured);
  const categories = await Product.distinct("category");

  res.json({
    products: products.map((product) => normalizeProduct(product, currency)),
    categories
  });
});

export const getFeaturedProducts = asyncHandler(async (req, res) => {
  const currency = req.query.currency || process.env.DEFAULT_CURRENCY || "USD";
  const products = await Product.find({ featured: true }).sort({ createdAt: -1 }).limit(6);
  res.json(products.map((product) => normalizeProduct(product, currency)));
});

export const getProductBySlug = asyncHandler(async (req, res) => {
  const currency = req.query.currency || process.env.DEFAULT_CURRENCY || "USD";
  const product = await Product.findOne({ slug: req.params.slug }).populate("reviews.user", "name");

  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }

  res.json(normalizeProduct(product, currency));
});

export const createProduct = asyncHandler(async (req, res) => {
  const media = (req.files || []).map((file) => ({
    type: file.mimetype.startsWith("video") ? "video" : "image",
    url: `/uploads/${file.filename}`,
    alt: file.originalname
  }));

  const product = await Product.create({
    ...req.body,
    tags: req.body.tags ? req.body.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [],
    trustBadges: req.body.trustBadges
      ? req.body.trustBadges.split(",").map((badge) => badge.trim()).filter(Boolean)
      : [],
    media
  });

  res.status(201).json(product);
});

export const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }

  const uploadedMedia = (req.files || []).map((file) => ({
    type: file.mimetype.startsWith("video") ? "video" : "image",
    url: `/uploads/${file.filename}`,
    alt: file.originalname
  }));

  Object.assign(product, {
    ...req.body,
    tags: req.body.tags ? req.body.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : product.tags,
    trustBadges: req.body.trustBadges
      ? req.body.trustBadges.split(",").map((badge) => badge.trim()).filter(Boolean)
      : product.trustBadges
  });

  if (uploadedMedia.length) {
    product.media = [...product.media, ...uploadedMedia];
  }

  await product.save();
  res.json(product);
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }

  res.json({ message: "Product deleted" });
});

export const addReview = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }

  const existingReview = product.reviews.find(
    (review) => review.user.toString() === req.user._id.toString()
  );

  if (existingReview) {
    existingReview.rating = Number(rating);
    existingReview.comment = comment;
  } else {
    product.reviews.push({
      user: req.user._id,
      name: req.user.name,
      rating: Number(rating),
      comment
    });
  }

  product.ratingCount = product.reviews.length;
  product.ratingAverage =
    product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length;

  await product.save();
  const populated = await Product.findById(product._id).populate("reviews.user", "name");
  res.status(201).json(populated);
});
