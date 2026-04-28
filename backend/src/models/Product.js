import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["image", "video"], default: "image" },
    url: { type: String, required: true },
    alt: String
  },
  { _id: false }
);

const packageDimensionsSchema = new mongoose.Schema(
  {
    lengthCm: Number,
    widthCm: Number,
    heightCm: Number
  },
  { _id: false }
);

const reviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: String,
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, required: true }
  },
  { timestamps: true }
);

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    description: { type: String, required: true },
    category: { type: String, required: true, trim: true },
    brand: { type: String, default: "YourGuyInJapan" },
    priceJPY: { type: Number, required: true },
    compareAtPriceJPY: Number,
    stock: { type: Number, default: 0 },
    featured: { type: Boolean, default: false },
    tags: [String],
    media: [mediaSchema],
    trustBadges: [String],
    ratingAverage: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    reviews: [reviewSchema],
    sourceUrl: { type: String, default: "" },
    weightKg: Number,
    packageDimensionsCm: packageDimensionsSchema
  },
  { timestamps: true }
);

export const Product = mongoose.model("Product", productSchema);
