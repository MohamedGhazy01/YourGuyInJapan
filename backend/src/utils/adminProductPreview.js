import { getMarketplaceSourceLabel } from "./marketplaceRules.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const decodeEntities = (value = "") =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();

const stripTags = (value = "") =>
  decodeEntities(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getAbsoluteUrl = (candidate = "", baseUrl) => {
  if (!candidate) return "";

  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return "";
  }
};

const readMeta = (html, ...selectors) => {
  for (const selector of selectors) {
    const escaped = escapeRegex(selector);
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
        "i"
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
        "i"
      )
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        return decodeEntities(match[1]);
      }
    }
  }

  return "";
};

const readJsonLdCandidates = (html) => {
  const matches = [
    ...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  ];

  return matches.map((match) => match[1]).filter(Boolean);
};

const findFirstString = (value, paths) => {
  for (const path of paths) {
    const current = path.reduce((acc, key) => {
      if (acc == null) return undefined;
      return acc[key];
    }, value);

    if (typeof current === "string" && current.trim()) {
      return current.trim();
    }

    if (Array.isArray(current)) {
      const firstString = current.find((entry) => typeof entry === "string" && entry.trim());
      if (firstString) return firstString.trim();

      const firstObjectUrl = current.find((entry) => entry?.url && typeof entry.url === "string");
      if (firstObjectUrl?.url) return firstObjectUrl.url.trim();
    }

    if (current?.url && typeof current.url === "string") {
      return current.url.trim();
    }

    if (current?.name && typeof current.name === "string") {
      return current.name.trim();
    }
  }

  return "";
};

const parseJsonLd = (html, baseUrl) => {
  for (const candidate of readJsonLdCandidates(html)) {
    try {
      const parsed = JSON.parse(candidate);
      const items = Array.isArray(parsed) ? parsed : [parsed];

      for (const item of items) {
        const title = findFirstString(item, [["name"], ["headline"]]);
        const image = getAbsoluteUrl(
          findFirstString(item, [["image"], ["image", 0], ["primaryImageOfPage"], ["thumbnailUrl"]]),
          baseUrl
        );
        const description = findFirstString(item, [["description"]]);
        const price = findFirstString(item, [["offers", "price"], ["offers", 0, "price"], ["price"]]);
        const brand = findFirstString(item, [
          ["brand"],
          ["brand", "name"],
          ["manufacturer"],
          ["manufacturer", "name"]
        ]);

        if (title || image || description || price || brand) {
          return { title, image, description, price, brand };
        }
      }
    } catch {
      continue;
    }
  }

  return {
    title: "",
    image: "",
    description: "",
    price: "",
    brand: ""
  };
};

const readTitleTag = (html) => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? stripTags(match[1]) : "";
};

const detectCharset = (buffer, response) => {
  const contentType = response.headers.get("content-type") || "";
  const headerCharset = contentType.match(/charset=([^;]+)/i)?.[1]?.trim().toLowerCase();
  if (headerCharset) return headerCharset;

  const head = buffer.toString("latin1", 0, Math.min(buffer.length, 4096));
  const metaCharset =
    head.match(/<meta[^>]+charset=["']?\s*([a-z0-9_\-]+)/i)?.[1]?.trim().toLowerCase() ||
    head.match(/<meta[^>]+content=["'][^"']*charset=([a-z0-9_\-]+)/i)?.[1]?.trim().toLowerCase();

  return metaCharset || "utf-8";
};

const decodeHtml = (buffer, response) => {
  const charset = detectCharset(buffer, response);

  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return buffer.toString("utf-8");
  }
};

const normalizeTitle = (title = "", source = "") =>
  title
    .replace(new RegExp(`\\s*[|\\uFF5C:\\uFF1A-]\\s*${escapeRegex(source)}.*$`, "i"), "")
    .replace(/^\u3010\u697D\u5929\u5E02\u5834\u3011/i, "")
    .replace(/\s+/g, " ")
    .trim();

const toPriceJPY = (value = "") => {
  const normalized = stripTags(value)
    .replace(/,/g, "")
    .replace(/JPY/gi, "")
    .replace(/[^\d.]/g, "")
    .trim();

  if (!normalized || !/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  return Math.round(Number(normalized));
};

const slugify = (value = "", source = "") => {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (normalized && !["product", "item", "official"].includes(normalized)) {
    return normalized;
  }

  const sourceSlug = (source || "product")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${sourceSlug || "product"}-${Date.now().toString().slice(-6)}`;
};

const classifyCategory = (value = "") => {
  const text = value.toLowerCase();

  const categoryRules = [
    ["Tech", /\b(keyboard|pc|laptop|camera|iphone|android|gaming|mouse|headphone|audio|console|monitor|usb)\b/],
    ["Beauty", /\b(cosmetic|makeup|skincare|gel|cream|lotion|serum|beauty|shampoo|conditioner)\b/],
    ["Accessories", /\b(bag|wallet|tote|watch|ring|necklace|bracelet|cap|hat|scarf|accessory)\b/],
    ["Fashion", /\b(jacket|shirt|hoodie|pants|denim|dress|coat|sneaker|shoe|apparel|fashion)\b/],
    ["Collectibles", /\b(figure|plush|anime|idol|card|trading|poster|merch|collectible|gundam)\b/],
    ["Books & Media", /\b(manga|book|magazine|dvd|cd|blu-ray|artbook)\b/],
    ["Tea & Food", /\b(matcha|tea|coffee|snack|food|drink)\b/],
    ["Home", /\b(mug|plate|bowl|kitchen|home|decor|lamp|storage|towel)\b/]
  ];

  const match = categoryRules.find(([, pattern]) => pattern.test(text));
  return match?.[0] || "General";
};

const generateTags = ({ title = "", description = "", brand = "", source = "", category = "" }) => {
  const seed = `${title} ${description} ${brand}`.toLowerCase();
  const words = [...seed.matchAll(/\b[a-z0-9]{3,}\b/g)].map((match) => match[0]);
  const uniqueWords = [];

  for (const word of words) {
    if (
      !uniqueWords.includes(word) &&
      !["with", "from", "that", "this", "your", "item", "official", "japan"].includes(word)
    ) {
      uniqueWords.push(word);
    }
  }

  return [source, category, brand, ...uniqueWords].filter(Boolean).slice(0, 8);
};

export const extractAdminProductPreview = async (rawUrl) => {
  const sourceUrl = new URL(rawUrl).toString();
  const response = await fetch(sourceUrl, {
    headers: {
      "user-agent": USER_AGENT,
      "accept-language": "ja,en-US;q=0.9,en;q=0.8"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error("Preview source could not be reached");
  }

  const htmlBuffer = Buffer.from(await response.arrayBuffer());
  const html = decodeHtml(htmlBuffer, response);
  const finalUrl = response.url || sourceUrl;
  const { hostname } = new URL(finalUrl);
  const source = getMarketplaceSourceLabel(finalUrl, hostname);
  const jsonLd = parseJsonLd(html, finalUrl);

  const title = normalizeTitle(
    readMeta(html, "og:title", "twitter:title") || jsonLd.title || readTitleTag(html),
    source
  );
  const image =
    getAbsoluteUrl(readMeta(html, "og:image", "twitter:image", "twitter:image:src"), finalUrl) ||
    jsonLd.image;
  const description =
    readMeta(html, "og:description", "description", "twitter:description") ||
    jsonLd.description ||
    `Imported from ${source}. Review and edit the product details before saving.`;
  const priceJPY =
    toPriceJPY(readMeta(html, "product:price:amount", "og:price:amount", "product:price")) ||
    toPriceJPY(jsonLd.price);
  const brand = readMeta(html, "product:brand", "og:brand") || jsonLd.brand || "";

  if (!title || !image) {
    throw new Error("Could not extract a usable product preview from this link");
  }

  const category = classifyCategory(`${title} ${description} ${brand}`);
  const slug = slugify(title, source);
  const tags = generateTags({ title, description, brand, source, category });

  return {
    title,
    image,
    priceJPY,
    description,
    brand,
    slug,
    tags,
    category,
    source,
    sourceUrl: finalUrl
  };
};
