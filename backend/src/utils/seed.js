import bcrypt from "bcryptjs";
import { Product } from "../models/Product.js";
import { User } from "../models/User.js";

const seededKeyboardUrl = "/seed-keyboard.svg";

const starterProducts = [
  {
    title: "Tokyo Artisan Matcha Set",
    slug: "tokyo-artisan-matcha-set",
    description: "A ceremonial-grade matcha starter bundle sourced from boutique makers in Tokyo.",
    category: "Tea",
    brand: "YourGuyInJapan Select",
    priceJPY: 12800,
    compareAtPriceJPY: 14900,
    stock: 12,
    featured: true,
    tags: ["matcha", "gift", "tea ceremony"],
    trustBadges: ["Authentic from Japan", "Carefully packed", "Worldwide shipping"],
    media: [
      {
        type: "image",
        url: "https://images.unsplash.com/photo-1515823064-d6e0c04616a7?auto=format&fit=crop&w=1200&q=80",
        alt: "Matcha set"
      }
    ]
  },
  {
    title: "Kyoto Indigo Travel Tote",
    slug: "kyoto-indigo-travel-tote",
    description: "A premium indigo-dyed tote designed for daily carry with understated Japanese detailing.",
    category: "Accessories",
    brand: "Kyoto Craft",
    priceJPY: 18400,
    stock: 8,
    featured: true,
    tags: ["bag", "travel", "indigo"],
    trustBadges: ["Handpicked", "Limited release", "Tracked delivery"],
    media: [
      {
        type: "image",
        url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
        alt: "Travel tote"
      }
    ]
  },
  {
    title: "Osaka Studio Mechanical Keyboard",
    slug: "osaka-studio-mechanical-keyboard",
    description: "Compact JIS-layout keyboard with refined acoustics and premium machining.",
    category: "Tech",
    brand: "Osaka Studio",
    priceJPY: 26800,
    stock: 10,
    featured: true,
    tags: ["tech", "keyboard", "workspace"],
    trustBadges: ["Tech inspected", "Protective packaging", "Warranty support"],
    media: [
      {
        type: "image",
        url: seededKeyboardUrl,
        alt: "Mechanical keyboard"
      }
    ]
  }
];

export const ensureSeedData = async () => {
  const productCount = await Product.countDocuments();
  if (!productCount) {
    await Product.insertMany(starterProducts);
  } else {
    for (const starter of starterProducts) {
      const existing = await Product.findOne({ slug: starter.slug });
      if (!existing) continue;

      // Refresh starter media when the seeded item still carries the original demo image.
      if (
        starter.slug === "osaka-studio-mechanical-keyboard" &&
        (
          !existing.media?.length ||
          existing.media[0]?.url?.includes("images.unsplash.com/photo-1517336714739-489689fd1ca8") ||
          existing.media[0]?.url === seededKeyboardUrl
        )
      ) {
        existing.media = starter.media;
        await existing.save();
      }
    }
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME || "Admin";

  if (!adminEmail || !adminPassword) {
    console.warn("Admin credentials missing in environment; admin bootstrap skipped.");
    return;
  }

  const existingAdmin = await User.findOne({ email: adminEmail.toLowerCase() });

  if (!existingAdmin) {
    const password = await bcrypt.hash(adminPassword, 10);
    await User.create({
      name: adminName,
      email: adminEmail.toLowerCase(),
      password,
      role: "admin"
    });
  }
};
