import asyncHandler from "express-async-handler";
import Stripe from "stripe";
import { Order } from "../models/Order.js";
import { Product } from "../models/Product.js";
import { convertFromJPY, getExchangeRate } from "../utils/currency.js";
import { getMarketplacePolicy } from "../utils/marketplaceRules.js";
import { sendOrderConfirmation } from "../utils/mailer.js";
import { findShippingZone, SHIPPING_RATE_TABLE } from "../utils/shippingRateTable.js";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const DEFAULT_ITEM_FALLBACK = {
  weightKgMin: 0.35,
  weightKgMax: 0.8,
  lengthCmMin: 24,
  lengthCmMax: 36,
  widthCmMin: 18,
  widthCmMax: 28,
  heightCmMin: 8,
  heightCmMax: 14
};

const buildOrderNumber = () => `YGJ-${Date.now().toString().slice(-8)}`;

const buildPaymentDetails = async (totalJPY, currency = "USD", paymentMethod = "mock") => {
  const exchangeRate = getExchangeRate(currency);
  let paymentStatus = "paid";
  let notes = "Mock checkout completed";

  if (paymentMethod === "stripe" && stripe) {
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(convertFromJPY(totalJPY, currency) * 100),
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true }
    });
    paymentStatus = "pending";
    notes = `Stripe payment intent: ${intent.id}`;
  }

  return {
    exchangeRate,
    paymentStatus,
    notes,
    paymentMethod: paymentMethod === "stripe" && stripe ? "stripe" : "mock"
  };
};

const roundShippingJPY = (value) => Math.max(0, Math.round(Number(value || 0) / 50) * 50);

const normalizePositiveNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const normalizeMethodKey = (value = "standard") =>
  String(value || "standard").trim().toLowerCase() === "express" ? "express" : "standard";

const normalizeCountryCode = (value = "US") => {
  const normalized = String(value || "US").trim().toUpperCase();
  return normalized || "US";
};

const getDefaultFallbackForItem = (item = {}) => {
  const title = String(item.title || "").toLowerCase();
  const category = String(item.category || "").toLowerCase();

  if (/keyboard|console|switch|camera/i.test(title) || /tech|electronics|games/i.test(category)) {
    return {
      weightKgMin: 0.6,
      weightKgMax: 1.4,
      lengthCmMin: 28,
      lengthCmMax: 40,
      widthCmMin: 20,
      widthCmMax: 30,
      heightCmMin: 8,
      heightCmMax: 16
    };
  }

  if (/bag|tote|backpack/i.test(title) || /accessories|fashion/i.test(category)) {
    return {
      weightKgMin: 0.45,
      weightKgMax: 0.95,
      lengthCmMin: 30,
      lengthCmMax: 42,
      widthCmMin: 24,
      widthCmMax: 34,
      heightCmMin: 10,
      heightCmMax: 18
    };
  }

  return DEFAULT_ITEM_FALLBACK;
};

const extractDimensions = (item = {}) => {
  const dimensions = item.packageDimensionsCm || item.dimensionsCm || {};
  return {
    lengthCm: normalizePositiveNumber(item.lengthCm ?? dimensions.lengthCm),
    widthCm: normalizePositiveNumber(item.widthCm ?? dimensions.widthCm),
    heightCm: normalizePositiveNumber(item.heightCm ?? dimensions.heightCm)
  };
};

const buildCartPackageProfile = (cartItems = []) => {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return null;
  }

  let weightKgMin = 0;
  let weightKgMax = 0;
  let maxLengthCmMin = 0;
  let maxLengthCmMax = 0;
  let maxWidthCmMin = 0;
  let maxWidthCmMax = 0;
  let stackedHeightCmMin = 0;
  let stackedHeightCmMax = 0;
  let incompleteData = false;

  for (const item of cartItems) {
    const quantity = Math.max(1, Math.floor(Number(item?.quantity) || 1));
    const fallback = getDefaultFallbackForItem(item);
    const weightKg = normalizePositiveNumber(item?.weightKg);
    const { lengthCm, widthCm, heightCm } = extractDimensions(item);

    const itemWeightMin = weightKg ?? fallback.weightKgMin;
    const itemWeightMax = weightKg ?? fallback.weightKgMax;
    const itemLengthMin = lengthCm ?? fallback.lengthCmMin;
    const itemLengthMax = lengthCm ?? fallback.lengthCmMax;
    const itemWidthMin = widthCm ?? fallback.widthCmMin;
    const itemWidthMax = widthCm ?? fallback.widthCmMax;
    const itemHeightMin = heightCm ?? fallback.heightCmMin;
    const itemHeightMax = heightCm ?? fallback.heightCmMax;

    if (weightKg == null || lengthCm == null || widthCm == null || heightCm == null) {
      incompleteData = true;
    }

    weightKgMin += itemWeightMin * quantity;
    weightKgMax += itemWeightMax * quantity;
    maxLengthCmMin = Math.max(maxLengthCmMin, itemLengthMin);
    maxLengthCmMax = Math.max(maxLengthCmMax, itemLengthMax);
    maxWidthCmMin = Math.max(maxWidthCmMin, itemWidthMin);
    maxWidthCmMax = Math.max(maxWidthCmMax, itemWidthMax);
    stackedHeightCmMin += itemHeightMin * quantity;
    stackedHeightCmMax += itemHeightMax * quantity;
  }

  return {
    weightKgMin,
    weightKgMax,
    lengthCmMin: maxLengthCmMin,
    lengthCmMax: maxLengthCmMax,
    widthCmMin: maxWidthCmMin,
    widthCmMax: maxWidthCmMax,
    heightCmMin: stackedHeightCmMin,
    heightCmMax: stackedHeightCmMax,
    incompleteData
  };
};

const buildManualPackageProfile = (payload = {}) => {
  const weightKg = normalizePositiveNumber(payload.weightKg);
  const lengthCm = normalizePositiveNumber(payload.lengthCm);
  const widthCm = normalizePositiveNumber(payload.widthCm);
  const heightCm = normalizePositiveNumber(payload.heightCm);

  if ([weightKg, lengthCm, widthCm, heightCm].some((value) => value == null)) {
    return null;
  }

  return {
    weightKgMin: weightKg,
    weightKgMax: weightKg,
    lengthCmMin: lengthCm,
    lengthCmMax: lengthCm,
    widthCmMin: widthCm,
    widthCmMax: widthCm,
    heightCmMin: heightCm,
    heightCmMax: heightCm,
    incompleteData: false
  };
};

const getSizeClass = (profile) => {
  const longest = Math.max(profile.lengthCmMax || 0, profile.widthCmMax || 0, profile.heightCmMax || 0);
  const girthLike = (profile.lengthCmMax || 0) + (profile.widthCmMax || 0) + (profile.heightCmMax || 0);

  if (longest > 80 || girthLike > 140) return "oversize";
  if (longest > 55 || girthLike > 105) return "large";
  if (longest > 35 || girthLike > 75) return "medium";
  return "small";
};

const getVolumetricWeight = (lengthCm, widthCm, heightCm) =>
  (Number(lengthCm || 0) * Number(widthCm || 0) * Number(heightCm || 0)) / 5000;

const findRateBracket = (rateRows = [], billableWeightKg = 0) =>
  rateRows.find((entry) => Number(billableWeightKg) <= Number(entry.maxKg)) || rateRows[rateRows.length - 1] || null;

const getRateFromBracket = (bracket, weightKg) => {
  if (!bracket) return null;
  if (Number(weightKg) <= Number(bracket.maxKg)) return Number(bracket.priceJPY);

  return Number(bracket.priceJPY) + Math.ceil((Number(weightKg) - Number(bracket.maxKg)) / 0.5) * 900;
};

const computeShippingOption = (profile, countryCode, methodKey) => {
  if (!profile) {
    return {
      shippingJPY: null,
      minShippingJPY: null,
      maxShippingJPY: null,
      isRange: false,
      priceConfidence: "unknown"
    };
  }

  const { zoneKey, zone } = findShippingZone(countryCode);
  const rateRows = zone.methods?.[methodKey] || [];
  const sizeClass = getSizeClass(profile);
  const sizeSurcharge = Number(zone.sizeSurchargesJPY?.[methodKey]?.[sizeClass] || 0);
  const volumetricWeightMin = getVolumetricWeight(profile.lengthCmMin, profile.widthCmMin, profile.heightCmMin);
  const volumetricWeightMax = getVolumetricWeight(profile.lengthCmMax, profile.widthCmMax, profile.heightCmMax);
  const billableWeightMin = Math.max(profile.weightKgMin, volumetricWeightMin);
  const billableWeightMax = Math.max(profile.weightKgMax, volumetricWeightMax);
  const minShippingJPY = roundShippingJPY(getRateFromBracket(findRateBracket(rateRows, billableWeightMin), billableWeightMin) + sizeSurcharge);
  const maxShippingJPY = roundShippingJPY(getRateFromBracket(findRateBracket(rateRows, billableWeightMax), billableWeightMax) + sizeSurcharge);

  if (profile.incompleteData) {
    return {
      shippingJPY: null,
      minShippingJPY,
      maxShippingJPY: Math.max(minShippingJPY, maxShippingJPY),
      isRange: true,
      priceConfidence: "range",
      zoneKey,
      sizeClass
    };
  }

  const exactShippingJPY = roundShippingJPY((minShippingJPY + maxShippingJPY) / 2);
  return {
    shippingJPY: exactShippingJPY,
    minShippingJPY: exactShippingJPY,
    maxShippingJPY: exactShippingJPY,
    isRange: false,
    priceConfidence: "exact",
    zoneKey,
    sizeClass
  };
};

const buildShippingEstimatePayload = ({
  mode,
  selectedMethod,
  destinationCountry,
  profile,
  itemCount = 0
}) => {
  const methods = {
    standard: computeShippingOption(profile, destinationCountry, "standard"),
    express: computeShippingOption(profile, destinationCountry, "express")
  };
  const activeOption = methods[selectedMethod] || methods.standard;

  return {
    mode,
    destinationCountry,
    deliveryPreference: selectedMethod,
    itemCount,
    exactData: !profile?.incompleteData,
    basisLabel:
      mode === "manual" ? "Estimated from manual package details" : "Estimated from selected cart items",
    previewLabel: SHIPPING_RATE_TABLE.metadata.label,
    rateTableLabel: SHIPPING_RATE_TABLE.metadata.basis,
    confirmationLabel: SHIPPING_RATE_TABLE.metadata.confirmation,
    methods,
    shippingJPY: activeOption?.isRange ? null : activeOption?.shippingJPY ?? null,
    minShippingJPY: activeOption?.minShippingJPY ?? null,
    maxShippingJPY: activeOption?.maxShippingJPY ?? null,
    priceConfidence: activeOption?.priceConfidence || "unknown",
    zoneKey: activeOption?.zoneKey || findShippingZone(destinationCountry).zoneKey,
    sizeClass: activeOption?.sizeClass || (profile ? getSizeClass(profile) : "small")
  };
};

export const estimateShipping = asyncHandler(async (req, res) => {
  const legacyCountry = req.body?.country;
  const mode = String(req.body?.mode || (req.body?.cartItems ? "cart" : req.body?.weightKg ? "manual" : "cart")).trim().toLowerCase();
  const destinationCountry = normalizeCountryCode(req.body?.destinationCountry || legacyCountry || "US");
  const selectedMethod = normalizeMethodKey(req.body?.deliveryPreference || req.body?.method || "standard");

  if (mode === "manual") {
    const profile = buildManualPackageProfile(req.body);
    if (!profile) {
      res.status(400);
      throw new Error("Manual package weight and dimensions are required for this estimate.");
    }

    res.json(
      buildShippingEstimatePayload({
        mode: "manual",
        selectedMethod,
        destinationCountry,
        profile,
        itemCount: 1
      })
    );
    return;
  }

  const cartItems = Array.isArray(req.body?.cartItems)
    ? req.body.cartItems
    : Array.from({ length: Math.max(1, Math.floor(Number(req.body?.items) || 1)) }, () => ({ quantity: 1 }));
  const profile = buildCartPackageProfile(cartItems);

  if (!profile) {
    res.json(
      buildShippingEstimatePayload({
        mode: "cart",
        selectedMethod,
        destinationCountry,
        profile: null,
        itemCount: 0
      })
    );
    return;
  }

  res.json(
    buildShippingEstimatePayload({
      mode: "cart",
      selectedMethod,
      destinationCountry,
      profile,
      itemCount: cartItems.reduce((sum, item) => sum + Math.max(1, Math.floor(Number(item?.quantity) || 1)), 0)
    })
  );
});

export const createOrder = asyncHandler(async (req, res) => {
  const { items, shippingAddress, currency = "USD", paymentMethod = "mock" } = req.body;

  if (!items?.length) {
    res.status(400);
    throw new Error("Cart is empty");
  }

  const productIds = items.map((item) => item.productId);
  const products = await Product.find({ _id: { $in: productIds } });
  const reviewRequiredProducts = products.filter((product) =>
    getMarketplacePolicy({ source: product.source, sourceUrl: product.sourceUrl }).requiresProxyApproval
  );

  if (reviewRequiredProducts.length) {
    res.status(400);
    throw new Error(
      `Admin review is required before checkout for: ${reviewRequiredProducts
        .map((product) => product.title)
        .join(", ")}`
    );
  }

  const normalizedItems = items.map((item) => {
    const product = products.find((entry) => entry._id.toString() === item.productId);
    if (!product) throw new Error("One or more products no longer exist");
    return {
      product: product._id,
      title: product.title,
      quantity: Number(item.quantity),
      priceJPY: product.priceJPY,
      media: product.media?.[0]?.url || ""
    };
  });

  const subtotalJPY = normalizedItems.reduce((sum, item) => sum + item.priceJPY * item.quantity, 0);
  const shippingJPY = Math.round(2200 + normalizedItems.length * 450);
  const taxJPY = Math.round(subtotalJPY * 0.1);
  const totalJPY = subtotalJPY + shippingJPY + taxJPY;
  const paymentDetails = await buildPaymentDetails(totalJPY, currency, paymentMethod);

  const order = await Order.create({
    user: req.user._id,
    orderNumber: buildOrderNumber(),
    items: normalizedItems,
    subtotalJPY,
    shippingJPY,
    taxJPY,
    totalJPY,
    currency,
    exchangeRate: paymentDetails.exchangeRate,
    shippingAddress,
    paymentMethod: paymentDetails.paymentMethod,
    paymentStatus: paymentDetails.paymentStatus,
    notes: paymentDetails.notes
  });

  await sendOrderConfirmation(order);

  res.status(201).json(order);
});

export const createMarketplaceDraftOrder = asyncHandler(async (req, res) => {
  const title = String(req.body?.title || "").trim();
  const image = String(req.body?.image || "").trim();
  const productUrl = String(req.body?.productUrl || "").trim();
  const source = String(req.body?.source || "").trim();
  const priceJPY = Math.max(0, Math.round(Number(req.body?.priceJPY || 0)));
  const currency = String(req.body?.currency || "USD").trim() || "USD";

  if (!title || !productUrl || !source || !priceJPY) {
    res.status(400);
    throw new Error("Marketplace result details are required");
  }

  const marketplace = getMarketplacePolicy({ source, sourceUrl: productUrl });

  if (!marketplace.canCheckoutNow) {
    res.status(400);
    throw new Error("This marketplace requires admin review before checkout");
  }

  const exchangeRate = getExchangeRate(currency);

  const order = await Order.create({
    user: req.user._id,
    orderNumber: buildOrderNumber(),
    sourceUrl: productUrl,
    estimatedPriceText: `JPY ${priceJPY.toLocaleString()}`,
    isDraft: true,
    items: [
      {
        title,
        quantity: 1,
        priceJPY,
        media: image
      }
    ],
    subtotalJPY: priceJPY,
    shippingJPY: 0,
    taxJPY: 0,
    totalJPY: priceJPY,
    currency,
    exchangeRate,
    paymentMethod: "mock",
    paymentStatus: "pending",
    notes: `Marketplace draft order created from ${source}`
  });

  res.status(201).json({
    orderId: order._id,
    checkoutUrl: `/checkout?orderId=${order._id}`,
    redirectUrl: `/checkout?orderId=${order._id}`,
    order
  });
});

export const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  const ownsOrder = order.user.toString() === req.user._id.toString();
  if (!ownsOrder && req.user.role !== "admin") {
    res.status(403);
    throw new Error("You do not have access to this order");
  }

  res.json(order);
});

export const completeDraftOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  if (order.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("You can only complete your own draft orders");
  }

  if (!order.isDraft) {
    res.status(400);
    throw new Error("This order has already been completed");
  }

  const { shippingAddress, currency = "USD", paymentMethod = "mock" } = req.body;

  const subtotalJPY = order.items.reduce((sum, item) => sum + Number(item.priceJPY || 0) * Number(item.quantity || 0), 0);
  const shippingJPY = Math.round(2200 + order.items.length * 450);
  const taxJPY = Math.round(subtotalJPY * 0.1);
  const totalJPY = subtotalJPY + shippingJPY + taxJPY;
  const paymentDetails = await buildPaymentDetails(totalJPY, currency, paymentMethod);

  order.subtotalJPY = subtotalJPY;
  order.shippingJPY = shippingJPY;
  order.taxJPY = taxJPY;
  order.totalJPY = totalJPY;
  order.currency = currency;
  order.exchangeRate = paymentDetails.exchangeRate;
  order.shippingAddress = shippingAddress;
  order.paymentMethod = paymentDetails.paymentMethod;
  order.paymentStatus = paymentDetails.paymentStatus;
  order.orderStatus = "processing";
  order.isDraft = false;
  order.notes = [
    order.proxyRequest ? `Completed from proxy request ${order.proxyRequest}` : "",
    paymentDetails.notes
  ]
    .filter(Boolean)
    .join(" | ");

  await order.save();
  await sendOrderConfirmation(order);

  res.json(order);
});

export const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json(orders);
});

export const getAllOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find().populate("user", "name email").sort({ createdAt: -1 });
  res.json(orders);
});

export const trackOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber });

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  res.json(order);
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  order.orderStatus = req.body.orderStatus || order.orderStatus;
  order.paymentStatus = req.body.paymentStatus || order.paymentStatus;
  order.trackingCode = req.body.trackingCode || order.trackingCode;
  await order.save();

  res.json(order);
});
