import mongoose from "mongoose";

const proxyRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  requestType: { type: String, enum: ["link", "description"], default: "link" },
  url: { type: String, default: "", trim: true },
  productTitle: { type: String, default: "", trim: true },
  productImage: { type: String, default: "", trim: true },
  productUrl: { type: String, default: "", trim: true },
  title: { type: String, default: "", trim: true },
  image: { type: String, default: "", trim: true },
  source: { type: String, default: "", trim: true },
  estimatedPriceText: { type: String, default: "", trim: true },
  estimatedPriceJPY: { type: Number, default: null },
  itemPriceJPY: { type: Number, default: null },
  serviceFeeJPY: { type: Number, default: null },
  shippingEstimateJPY: { type: Number, default: null },
  totalPriceJPY: { type: Number, default: null },
  requestedBudgetJPY: { type: Number, default: null },
  requestedCondition: { type: String, default: "", trim: true },
  customerNotes: { type: String, default: "", trim: true },
  originalUserMessage: { type: String, default: "", trim: true },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },
  adminNotes: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

export const ProxyRequest =
  mongoose.models.ProxyRequest || mongoose.model("ProxyRequest", proxyRequestSchema);
