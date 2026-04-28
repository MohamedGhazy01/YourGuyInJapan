import asyncHandler from "express-async-handler";
import { Order } from "../models/Order.js";
import { Product } from "../models/Product.js";
import { User } from "../models/User.js";
import { convertFromJPY } from "../utils/currency.js";

const normalizeWishlistItems = (items, currency = process.env.DEFAULT_CURRENCY || "USD") =>
  items.map((product) => ({
    ...product.toObject(),
    price: convertFromJPY(product.priceJPY, currency),
    compareAtPrice: product.compareAtPriceJPY ? convertFromJPY(product.compareAtPriceJPY, currency) : null,
    currency
  }));

export const toggleWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.body;
  const currency = req.query.currency || process.env.DEFAULT_CURRENCY || "USD";
  const product = await Product.findById(productId);

  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }

  const index = req.user.wishlist.findIndex((id) => id.toString() === productId);

  if (index >= 0) {
    req.user.wishlist.splice(index, 1);
  } else {
    req.user.wishlist.push(productId);
  }

  await req.user.save();
  const populated = await User.findById(req.user._id).populate("wishlist");
  res.json(normalizeWishlistItems(populated.wishlist, currency));
});

export const getWishlist = asyncHandler(async (req, res) => {
  const currency = req.query.currency || process.env.DEFAULT_CURRENCY || "USD";
  const user = await User.findById(req.user._id).populate("wishlist");
  res.json(normalizeWishlistItems(user.wishlist, currency));
});

export const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find().select("-password").sort({ createdAt: -1 });
  res.json(users);
});

export const getDashboardStats = asyncHandler(async (req, res) => {
  const [users, orders, products] = await Promise.all([
    User.countDocuments(),
    Order.find(),
    Product.countDocuments()
  ]);

  const revenueJPY = orders.reduce((sum, order) => sum + (order.totalJPY || 0), 0);

  res.json({
    users,
    products,
    orders: orders.length,
    revenueJPY,
    recentOrders: orders.slice(-5).reverse()
  });
});
