import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    title: String,
    quantity: Number,
    priceJPY: Number,
    media: String
  },
  { _id: false }
);

const shippingSchema = new mongoose.Schema(
  {
    fullName: String,
    email: String,
    line1: String,
    line2: String,
    city: String,
    state: String,
    postalCode: String,
    country: String,
    phone: String
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    orderNumber: { type: String, required: true, unique: true },
    proxyRequest: { type: mongoose.Schema.Types.ObjectId, ref: "ProxyRequest", default: null },
    sourceUrl: { type: String, default: "" },
    estimatedPriceText: { type: String, default: "" },
    isDraft: { type: Boolean, default: false },
    items: [orderItemSchema],
    subtotalJPY: Number,
    shippingJPY: Number,
    taxJPY: Number,
    totalJPY: Number,
    currency: { type: String, default: "USD" },
    exchangeRate: { type: Number, default: 0.0066 },
    shippingAddress: shippingSchema,
    paymentMethod: { type: String, default: "mock" },
    paymentStatus: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
    orderStatus: {
      type: String,
      enum: ["processing", "shipped", "delivered"],
      default: "processing"
    },
    trackingCode: String,
    notes: String
  },
  { timestamps: true }
);

export const Order = mongoose.model("Order", orderSchema);
