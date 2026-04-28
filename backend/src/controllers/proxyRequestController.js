import asyncHandler from "express-async-handler";
import { Order } from "../models/Order.js";
import { Product } from "../models/Product.js";
import { ProxyRequest } from "../models/proxyRequestModel.js";
import { getExchangeRate } from "../utils/currency.js";
import { getMarketplacePolicy } from "../utils/marketplaceRules.js";
import { sendOrderConfirmation } from "../utils/mailer.js";
import { extractProductPreview } from "../utils/productPreview.js";

const allowedStatuses = ["approved", "rejected"];
const buildOrderNumber = () => `YGJ-${Date.now().toString().slice(-8)}`;

const parseJPYAmount = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
};

const CONDITION_PATTERNS = [
  { condition: "New", patterns: [/\bnew\b/i, /unused/i, /sealed/i, /新品/i, /未使用/i] },
  { condition: "Used", patterns: [/\bused\b/i, /pre[-\s]?owned/i, /secondhand/i, /中古/i] },
  { condition: "Good condition", patterns: [/good condition/i, /美品/i] },
  { condition: "Any condition", patterns: [/any condition/i, /condition does not matter/i, /どんな状態/i] }
];

const FILLER_REQUEST_PATTERNS = [
  /\b(i\s+want|i'm\s+looking\s+for|looking\s+for|find\s+(?:me\s+)?(?:a\s+|an\s+|the\s+)?|please|request|buy|get|want)\b/gi,
  /\b(?:under|below|less\s+than|up\s+to|max|maximum|budget)\s*(?:of|is|around|about)?\s*[¥￥]?\s*\d[\d,]*(?:\s*(?:yen|jpy|円))?/gi,
  /[¥￥]\s*\d[\d,]*/gi,
  /\b\d[\d,]*\s*(?:yen|jpy|円)\b/gi,
  /\b(new|unused|sealed|used|pre[-\s]?owned|secondhand|good condition|any condition)\b/gi
];

const extractRequestBudgetJPY = (message) => {
  const budgetMatch = message.match(
    /\b(?:under|below|less\s+than|up\s+to|max|maximum|budget)\s*(?:of|is|around|about)?\s*[¥￥]?\s*(\d[\d,]*)\s*(?:yen|jpy|円)?/i
  );
  const yenMatch = message.match(/[¥￥]\s*(\d[\d,]*)|\b(\d[\d,]*)\s*(?:yen|jpy|円)\b/i);
  const rawValue = budgetMatch?.[1] || yenMatch?.[1] || yenMatch?.[2] || "";
  const parsed = Number(String(rawValue).replace(/,/g, ""));

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
};

const extractRequestCondition = (message) => {
  const match = CONDITION_PATTERNS.find((condition) =>
    condition.patterns.some((pattern) => pattern.test(message))
  );

  return match?.condition || "";
};

const extractRequestTitle = (message, condition) => {
  const stripped = FILLER_REQUEST_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, " "),
    String(message || "")
  )
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/^[,.;:\s]+|[,.;:\s]+$/g, "")
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (stripped) return stripped;
  if (condition) return `${condition} Japanese item`;
  return String(message || "").trim();
};

const buildRequestNotes = ({ message, title, budget, condition }) => {
  const parts = [];
  if (condition) parts.push(`Preferred condition: ${condition}.`);
  if (budget) parts.push(`Budget: JPY ${budget.toLocaleString()}.`);
  parts.push(`Original description: ${message}`);

  return parts.join("\n");
};

const getRequestPriceBreakdown = (request) => {
  const itemPriceJPY = parseJPYAmount(request.itemPriceJPY);
  const serviceFeeJPY = parseJPYAmount(request.serviceFeeJPY);
  const shippingEstimateJPY = parseJPYAmount(request.shippingEstimateJPY);

  if (itemPriceJPY === null || serviceFeeJPY === null || shippingEstimateJPY === null) {
    return null;
  }

  return {
    itemPriceJPY,
    serviceFeeJPY,
    shippingEstimateJPY,
    totalPriceJPY: itemPriceJPY + serviceFeeJPY + shippingEstimateJPY
  };
};

const isValidUrl = (value = "") => {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};

const findExistingOpenRequest = (userId, productUrl) =>
  ProxyRequest.findOne({
    user: userId,
    productUrl,
    status: { $in: ["pending", "approved"] }
  }).sort({ createdAt: -1 });

const parseEstimatedPriceJPY = (value = "") => {
  const normalized = String(value || "").trim();
  if (!normalized) return null;

  const looksLikeYen = /(?:JPY|¥|￥|円)/i.test(normalized);
  const digits = normalized.replace(/[^\d.]/g, "");

  if (!digits) return null;

  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return null;

  return looksLikeYen || /^[\d,.]+$/.test(normalized) ? Math.round(parsed) : null;
};

const getProxyRequestSnapshot = async (request) => {
  const savedTitle = request.productTitle || request.title;
  const savedImage = request.productImage || request.image;
  const savedUrl = request.productUrl || request.url;

  if (savedTitle && savedImage) {
    return {
      title: savedTitle,
      image: savedImage,
      source: request.source,
      sourceUrl: savedUrl,
      estimatedPriceText: request.estimatedPriceText,
      estimatedPriceJPY: request.estimatedPriceJPY
    };
  }

  const preview = await extractProductPreview(request.url);

  request.productTitle = preview.title || request.productTitle || request.title;
  request.productImage = preview.image || request.productImage || request.image;
  request.productUrl = preview.sourceUrl || request.productUrl || request.url;
  request.title = request.productTitle;
  request.image = request.productImage;
  request.source = preview.source || request.source;
  request.estimatedPriceText = preview.price || request.estimatedPriceText;
  request.estimatedPriceJPY = parseEstimatedPriceJPY(preview.price);
  await request.save();

  return {
    title: request.productTitle || request.title,
    image: request.productImage || request.image,
    source: request.source,
    sourceUrl: request.productUrl || request.url,
    estimatedPriceText: request.estimatedPriceText,
    estimatedPriceJPY: request.estimatedPriceJPY
  };
};

export const createProxyRequest = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    res.status(401);
    throw new Error("Authentication required");
  }

  const productId = String(req.body?.productId || "").trim();

  if (productId) {
    const product = await Product.findById(productId);

    if (!product) {
      res.status(404);
      throw new Error("Product not found");
    }

    const marketplace = getMarketplacePolicy({
      source: product.source,
      sourceUrl: product.sourceUrl
    });

    if (!marketplace.requiresProxyApproval) {
      res.status(400);
      throw new Error("This product can proceed directly to checkout");
    }

    const productUrl = String(product.sourceUrl || "").trim();

    if (!isValidUrl(productUrl)) {
      res.status(422);
      throw new Error("This product is missing a valid source link for review");
    }

    const existingRequest = await findExistingOpenRequest(req.user._id, productUrl);

    if (existingRequest) {
      res.json({ ...existingRequest.toObject(), existing: true });
      return;
    }

    const request = await ProxyRequest.create({
      user: req.user._id,
      url: productUrl,
      productUrl,
      productTitle: product.title,
      productImage: product.media?.[0]?.url || "",
      title: product.title,
      image: product.media?.[0]?.url || "",
      source: marketplace.source,
      estimatedPriceJPY: product.priceJPY ?? null,
      estimatedPriceText:
        product.priceJPY != null ? `JPY ${Number(product.priceJPY).toLocaleString()}` : "",
      status: "pending"
    });

    res.status(201).json({ ...request.toObject(), existing: false });
    return;
  }

  const url = String(req.body?.url || "").trim();
  const describedTitle = String(req.body?.title || req.body?.productTitle || "").trim();

  if (!url && describedTitle) {
    const budgetJPY = parseJPYAmount(req.body?.budget ?? req.body?.requestedBudgetJPY);
    const condition = String(req.body?.condition || req.body?.requestedCondition || "").trim();
    const notes = String(req.body?.notes || req.body?.customerNotes || "").trim();
    const originalUserMessage = String(req.body?.originalUserMessage || "").trim();

    const request = await ProxyRequest.create({
      user: req.user._id,
      requestType: "description",
      url: "",
      productUrl: "",
      productTitle: describedTitle,
      productImage: "",
      title: describedTitle,
      image: "",
      source: "Describe Item",
      estimatedPriceJPY: budgetJPY,
      estimatedPriceText: budgetJPY ? `JPY ${budgetJPY.toLocaleString()}` : "",
      requestedBudgetJPY: budgetJPY,
      requestedCondition: condition,
      customerNotes: notes,
      originalUserMessage,
      status: "pending"
    });

    res.status(201).json(request);
    return;
  }

  if (!url) {
    res.status(400);
    throw new Error("Product URL is required");
  }

  if (!isValidUrl(url)) {
    res.status(400);
    throw new Error("Please provide a valid product URL");
  }

  const existingRequest = await findExistingOpenRequest(req.user._id, url);

  if (existingRequest) {
    res.json({ ...existingRequest.toObject(), existing: true });
    return;
  }

  const request = await ProxyRequest.create({
    user: req.user._id,
    url,
    productUrl: url,
    status: "pending"
  });

  try {
    const preview = await extractProductPreview(url);
    request.productTitle = preview.title || "";
    request.productImage = preview.image || "";
    request.productUrl = preview.sourceUrl || url;
    request.title = request.productTitle;
    request.image = request.productImage;
    request.source = preview.source || "";
    request.estimatedPriceText = preview.price || "";
    request.estimatedPriceJPY = parseEstimatedPriceJPY(preview.price);
    await request.save();
  } catch {
    request.productTitle = "Requested item";
    request.productImage = "";
    request.productUrl = url;
    request.title = "Requested item";
    request.image = "";
    await request.save();
  }

  res.status(201).json(request);
});

export const generateProxyRequestDraft = asyncHandler(async (req, res) => {
  const userMessage = String(req.body?.userMessage || "").trim();

  if (!userMessage) {
    res.status(400);
    throw new Error("userMessage is required");
  }

  const budget = extractRequestBudgetJPY(userMessage);
  const condition = extractRequestCondition(userMessage);
  const title = extractRequestTitle(userMessage, condition);

  res.json({
    title,
    budget,
    condition,
    notes: buildRequestNotes({ message: userMessage, title, budget, condition })
  });
});

export const getMyProxyRequests = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    res.status(401);
    throw new Error("Authentication required");
  }

  const requests = await ProxyRequest.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json(requests);
});

export const getAllProxyRequests = asyncHandler(async (req, res) => {
  const requests = await ProxyRequest.find()
    .populate("user", "name email")
    .sort({ createdAt: -1 });

  res.json(requests);
});

export const updateProxyRequestStatus = asyncHandler(async (req, res) => {
  const status = String(req.body?.status || "").trim().toLowerCase();

  if (!allowedStatuses.includes(status)) {
    res.status(400);
    throw new Error("Status must be approved or rejected");
  }

  const request = await ProxyRequest.findById(req.params.id);

  if (!request) {
    res.status(404);
    throw new Error("Proxy request not found");
  }

  const itemPriceJPY = parseJPYAmount(req.body?.itemPriceJPY);
  const serviceFeeJPY = parseJPYAmount(req.body?.serviceFeeJPY);
  const shippingEstimateJPY = parseJPYAmount(req.body?.shippingEstimateJPY);

  if (status === "approved" && [itemPriceJPY, serviceFeeJPY, shippingEstimateJPY].some((value) => value === null)) {
    res.status(400);
    throw new Error("Item price, service fee, and shipping estimate are required before approving");
  }

  request.status = status;

  if (itemPriceJPY !== null) request.itemPriceJPY = itemPriceJPY;
  if (serviceFeeJPY !== null) request.serviceFeeJPY = serviceFeeJPY;
  if (shippingEstimateJPY !== null) request.shippingEstimateJPY = shippingEstimateJPY;
  request.totalPriceJPY =
    request.itemPriceJPY !== null && request.serviceFeeJPY !== null && request.shippingEstimateJPY !== null
      ? Number(request.itemPriceJPY || 0) + Number(request.serviceFeeJPY || 0) + Number(request.shippingEstimateJPY || 0)
      : null;

  if (typeof req.body?.adminNotes === "string") {
    request.adminNotes = req.body.adminNotes.trim();
  }

  await request.save();

  await request.populate("user", "name email");

  res.json(request);
});

export const getProxyRequestCheckout = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    res.status(401);
    throw new Error("Authentication required");
  }

  const request = await ProxyRequest.findById(req.params.id);

  if (!request) {
    res.status(404);
    throw new Error("Proxy request not found");
  }

  if (request.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("You can only access your own approved requests");
  }

  if (request.status !== "approved") {
    res.status(400);
    throw new Error("Only approved requests can continue to checkout");
  }

  const breakdown = getRequestPriceBreakdown(request);

  if (!breakdown) {
    res.status(422);
    throw new Error("This approved request is missing a price breakdown");
  }

  res.json({
    ...request.toObject(),
    ...breakdown
  });
});

export const continueOrderingFromProxyRequest = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    res.status(401);
    throw new Error("Authentication required");
  }

  const request = await ProxyRequest.findById(req.params.id);

  if (!request) {
    res.status(404);
    throw new Error("Proxy request not found");
  }

  if (request.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("You can only continue ordering your own approved requests");
  }

  if (request.status !== "approved") {
    res.status(400);
    throw new Error("Only approved requests can continue to checkout");
  }

  const breakdown = getRequestPriceBreakdown(request);

  if (!breakdown) {
    res.status(422);
    throw new Error("This approved request is missing a price breakdown");
  }

  const existingOrder = await Order.findOne({ proxyRequest: request._id });

  if (existingOrder) {
    const redirectUrl = existingOrder.isDraft
      ? `/checkout?orderId=${existingOrder._id}`
      : `/track-order?orderNumber=${encodeURIComponent(existingOrder.orderNumber)}`;

    res.json({
      orderId: existingOrder._id,
      orderNumber: existingOrder.orderNumber,
      checkoutUrl: `/checkout?orderId=${existingOrder._id}`,
      redirectUrl,
      existing: true
    });
    return;
  }

  res.json({
    checkoutUrl: `/checkout?proxyRequestId=${request._id}`,
    redirectUrl: `/checkout?proxyRequestId=${request._id}`,
    priceBreakdown: breakdown,
    existing: false
  });
});

export const createOrderFromProxyRequest = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    res.status(401);
    throw new Error("Authentication required");
  }

  const request = await ProxyRequest.findById(req.params.id);

  if (!request) {
    res.status(404);
    throw new Error("Proxy request not found");
  }

  if (request.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("You can only order your own approved requests");
  }

  if (request.status !== "approved") {
    res.status(400);
    throw new Error("Only approved requests can be ordered");
  }

  const existingOrder = await Order.findOne({ proxyRequest: request._id });

  if (existingOrder) {
    res.json(existingOrder);
    return;
  }

  const breakdown = getRequestPriceBreakdown(request);

  if (!breakdown) {
    res.status(422);
    throw new Error("This approved request is missing a price breakdown");
  }

  let snapshot;

  try {
    snapshot = await getProxyRequestSnapshot(request);
  } catch (error) {
    res.status(422);
    throw new Error(error.message || "This approved request is not ready for checkout yet");
  }

  if (!snapshot.title || !snapshot.image) {
    res.status(422);
    throw new Error("This approved request is missing product details needed for checkout");
  }

  const { shippingAddress, currency = "USD", paymentMethod = "mock" } = req.body;
  const exchangeRate = getExchangeRate(currency);

  const order = await Order.create({
    user: req.user._id,
    orderNumber: buildOrderNumber(),
    proxyRequest: request._id,
    sourceUrl: snapshot.sourceUrl,
    estimatedPriceText: snapshot.estimatedPriceText || "",
    isDraft: false,
    items: [
      {
        title: snapshot.title,
        quantity: 1,
        priceJPY: breakdown.itemPriceJPY + breakdown.serviceFeeJPY,
        media: snapshot.image
      }
    ],
    subtotalJPY: breakdown.itemPriceJPY + breakdown.serviceFeeJPY,
    shippingJPY: breakdown.shippingEstimateJPY,
    taxJPY: 0,
    totalJPY: breakdown.totalPriceJPY,
    currency,
    exchangeRate,
    shippingAddress,
    paymentMethod,
    paymentStatus: paymentMethod === "mock" ? "paid" : "pending",
    notes: `Proxy request order created from request ${request._id}`
  });

  await sendOrderConfirmation(order);

  res.status(201).json(order);
});
