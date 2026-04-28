import { getMarketplaceSourceLabel } from "./marketplaceRules.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const JAPANESE_MARKETPLACE_HOSTS =
  /mercari|rakuma|fril|rakuten|amazon\.co\.jp|auctions\.yahoo|paypayfleamarket|paypay/i;

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

const cleanPrice = (value = "") => {
  const normalized = stripTags(value)
    .replace(/\s+/g, " ")
    .replace(/^\s+|\s+$/g, "");

  if (!normalized) return "";

  const currencyMatch = normalized.match(
    /(?:JPY|USD|EUR|GBP|\u00A5|\uFFE5|\$|\u20AC|\u00A3)\s?[\d,]+(?:\.\d{1,2})?/i
  );
  if (currencyMatch) {
    return currencyMatch[0];
  }

  const yenMatch = normalized.match(/[\d,]+(?:\.\d{1,2})?\s?\u5186/);
  if (yenMatch) {
    return yenMatch[0];
  }

  return "";
};

const formatNumericYen = (value = "") => {
  const normalized = stripTags(value).replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return "";
  }

  return `JPY ${Number(normalized).toLocaleString("en-US")}`;
};

const getAbsoluteUrl = (candidate = "", baseUrl) => {
  if (!candidate) return "";

  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return "";
  }
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

      const firstUrl = current.find((entry) => entry?.url && typeof entry.url === "string");
      if (firstUrl?.url) return firstUrl.url.trim();
    }

    if (current?.url && typeof current.url === "string") {
      return current.url.trim();
    }
  }

  return "";
};

const findJsonLdPreview = (html, baseUrl) => {
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
        const price = cleanPrice(
          findFirstString(item, [["offers", "price"], ["offers", 0, "price"], ["price"]])
        );

        if (title || image || price) {
          return { title, image, price };
        }
      }
    } catch {
      continue;
    }
  }

  return { title: "", image: "", price: "" };
};

const readTitleTag = (html) => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? stripTags(match[1]) : "";
};

const readImageCandidates = (html, baseUrl) => {
  return [
    readMeta(html, "og:image", "twitter:image", "twitter:image:src"),
    getAbsoluteUrl(
      html.match(
        /<img[^>]+src=["']([^"']+)["'][^>]*class=["'][^"']*(?:product|item|gallery|main)[^"']*["'][^>]*>/i
      )?.[1] || "",
      baseUrl
    ),
    getAbsoluteUrl(
      html.match(
        /<img[^>]+class=["'][^"']*(?:product|item|gallery|main)[^"']*["'][^>]+src=["']([^"']+)["'][^>]*>/i
      )?.[1] || "",
      baseUrl
    )
  ]
    .map((entry) => getAbsoluteUrl(entry, baseUrl))
    .filter(Boolean);
};

const readPriceCandidates = (html) => {
  return [
    readMeta(
      html,
      "product:price:amount",
      "og:price:amount",
      "product:price",
      "price:amount"
    ),
    readMeta(html, "product:price:currency") && readMeta(html, "product:price:amount")
  ]
    .map((entry) => cleanPrice(entry))
    .filter(Boolean);
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

export const extractProductPreview = async (rawUrl) => {
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
  const jsonLd = findJsonLdPreview(html, finalUrl);
  const isJapaneseMarketplace = JAPANESE_MARKETPLACE_HOSTS.test(hostname);
  const title = readMeta(html, "og:title", "twitter:title") || jsonLd.title || readTitleTag(html);
  const image = readImageCandidates(html, finalUrl)[0] || jsonLd.image;
  const price =
    readPriceCandidates(html)[0] ||
    cleanPrice(jsonLd.price) ||
    (isJapaneseMarketplace ? formatNumericYen(jsonLd.price) : "");

  if (!title || !image) {
    throw new Error("Could not extract a usable product preview from this link");
  }

  return {
    title,
    image,
    price,
    sourceUrl: finalUrl,
    url: finalUrl,
    source: getMarketplaceSourceLabel(finalUrl, hostname)
  };
};
