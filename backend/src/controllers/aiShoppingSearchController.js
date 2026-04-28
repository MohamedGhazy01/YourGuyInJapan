import asyncHandler from "express-async-handler";
import crypto from "node:crypto";
import { marketplaceSourceKeys } from "./marketplaceSearchController.js";
import { searchMercari } from "../utils/mercariSearch.js";
import { searchYahoo } from "../utils/yahooSearch.js";

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const BRAVE_FETCH_LIMIT = 10;
const FINAL_RESULT_LIMIT = 8;
const ENRICH_RESULT_LIMIT = 5;
const ENRICH_TIMEOUT_MS = 6500;
const BRAVE_TOTAL_TIMEOUT_MS = 8000;
const MERCARI_TOTAL_TIMEOUT_MS = 15000;
const YAHOO_TOTAL_TIMEOUT_MS = 12000;
const STRICT_RESULT_MINIMUM = 3;
const CACHE_TTL_MS = 5 * 60 * 1000;
const AMAZON_PAAPI_HOST = "webservices.amazon.co.jp";
const AMAZON_PAAPI_REGION = "us-west-2";
const AMAZON_PAAPI_PATH = "/paapi5/searchitems";
const NO_RESULTS_MESSAGE = "No direct items found. Try a more specific or Japanese search.";
const BROADER_RESULTS_MESSAGE = "Showing broader results due to limited matches.";
const YAHOO_NO_RESULTS_MESSAGE = "No shopping results found for Yahoo. Try a different keyword.";
const MERCARI_NO_RESULTS_MESSAGE = "No available Mercari items found. Try another keyword.";
const DELETED_ITEM_PATTERNS = [/該当する商品は削除されています/i, /\bdeleted\b/i, /\bunavailable\b/i];

const MERCARI_SOLD_OUT_PATTERNS = [
  { pattern: /\bSOLD\b/i, reason: "sold_badge" },
  { pattern: /売り切れ/i, reason: "sold_japanese" },
  { pattern: /\bsold\s*out\b/i, reason: "sold_out_text" },
  { pattern: /\bitem\s+sold\b/i, reason: "item_sold_text" },
  { pattern: /購入できません|購入不可|在庫なし/i, reason: "purchase_unavailable_text" }
];
const AUCTION_BLOCK_PATTERNS = [/\bauction\b/i, /\bbid(?:ding)?\b/i, /オークション/i, /入札/i];

const aiSearchCache = new Map();

const SOURCE_SEARCH_CONFIG = {
  mercari: { siteFilterStrict: "", siteFilterRelaxed: "", domains: ["jp.mercari.com"] },
  rakuma: { siteFilterStrict: "site:item.fril.jp", siteFilterRelaxed: "site:item.fril.jp", domains: ["item.fril.jp"] },
  rakuten: { siteFilterStrict: "site:rakuten.co.jp", siteFilterRelaxed: "site:rakuten.co.jp", domains: ["rakuten.co.jp"] },
  amazon: { siteFilterStrict: "site:amazon.co.jp", siteFilterRelaxed: "site:amazon.co.jp", domains: ["amazon.co.jp"] },
  yahoo: {
    siteFilterStrict: "(site:shopping.yahoo.co.jp OR site:store.shopping.yahoo.co.jp)",
    siteFilterRelaxed: "(site:shopping.yahoo.co.jp OR site:store.shopping.yahoo.co.jp)",
    domains: ["shopping.yahoo.co.jp", "store.shopping.yahoo.co.jp"]
  }
};

const SOURCE_ALIASES = [
  { key: "mercari", patterns: [/\bmercari\b/i, /\bmerukari\b/i, /\bmerucari\b/i, /メルカリ/i] },
  { key: "amazon", patterns: [/\bamazon\b/i, /アマゾン/i, /Amazonで/i] },
  { key: "rakuten", patterns: [/\brakuten\b/i, /楽天/i] },
  { key: "rakuma", patterns: [/\brakuma\b/i, /\brakum\b/i, /\bfril\b/i, /ラクマ/i] },
  { key: "yahoo", patterns: [/\byahoo\b/i, /\bauction/i, /ヤフー/i, /Yahooで/i] }
];

const SOURCE_DISPLAY_NAMES = {
  mercari: "メルカリ",
  amazon: "Amazon Japan",
  rakuten: "楽天",
  rakuma: "ラクマ",
  yahoo: "Yahoo"
};

const CATEGORY_HINTS = [
  { category: "Figures", patterns: [/\bfigure/i, /\bfigurine/i, /フィギュア/i] },
  { category: "Anime", patterns: [/\banime/i, /\bmanga/i, /\bluffy\b/i, /\bnaruto\b/i, /\bone piece\b/i, /アニメ/i] },
  { category: "Games", patterns: [/\bgame/i, /\bnintendo/i, /\bplaystation/i, /\bswitch/i, /\bconsole/i, /ゲーム/i] },
  { category: "Fashion", patterns: [/\bshirt/i, /\bjacket/i, /\bsneaker/i, /\bbag/i, /\bfashion/i, /バッグ/i] },
  { category: "Beauty", patterns: [/\bcosmetic/i, /\bskincare/i, /\bmakeup/i, /\bbeauty/i] },
  { category: "Collectibles", patterns: [/\bcollectible/i, /\bcard/i, /\bpokemon/i, /\btrading card/i, /カード/i] },
  { category: "Electronics", patterns: [/\bcamera/i, /\bheadphone/i, /\bkeyboard/i, /\belectronic/i] },
  { category: "Home", patterns: [/\bceramic/i, /\bkitchen/i, /\bhome/i, /\bstationery/i] }
];

const TYPO_NORMALIZATIONS = [
  { pattern: /\buder\b/gi, replacement: "under" },
  { pattern: /\bmerucari\b/gi, replacement: "mercari" }
];

const KEYWORD_STRIP_PATTERNS = [
  /\b(i\s+want|i'm\s+looking\s+for|looking\s+for|find|search|show\s+me|please|buy|get|want)\b/gi,
  /\b(from|on)\s+(mercari|amazon|amazon japan|rakuten|rakuma|yahoo|yahoo auctions)\b/gi,
  /\b(mercari|amazon|amazon japan|rakuten|rakuma|yahoo|yahoo auctions)\b/gi,
  /\b(under|below|less\s+than|up\s+to|max|maximum|budget|yen|jpy)\b/gi,
  /メルカリで|メルカリの|Amazonで|楽天で|ラクマで|Yahooで/gi,
  /販売中の|を探して|探して/gi,
  /(?:¥|円)/g,
  /\b\d[\d,]*\b/gi
];

const JAPANESE_TERM_MAP = [
  { pattern: /\bluffy figure\b/gi, replacement: "ルフィ フィギュア" },
  { pattern: /\bpokemon cards?\b/gi, replacement: "ポケモンカード" },
  { pattern: /\bpokemon card\b/gi, replacement: "ポケモンカード" },
  { pattern: /\bnintendo switch(?: 2)?\b/gi, replacement: "ニンテンドースイッチ 本体" },
  { pattern: /\bluffy\b/gi, replacement: "ルフィ" },
  { pattern: /\bnaruto\b/gi, replacement: "ナルト" },
  { pattern: /\bpokemon\b/gi, replacement: "ポケモン" },
  { pattern: /\bfigure?s?\b/gi, replacement: "フィギュア" },
  { pattern: /\bcards?\b/gi, replacement: "カード" },
  { pattern: /\bbags?\b/gi, replacement: "バッグ" },
  { pattern: /\bshoes?\b/gi, replacement: "靴" },
  { pattern: /\bsneakers?\b/gi, replacement: "スニーカー" },
  { pattern: /\bporter\b/gi, replacement: "ポーター" },
  { pattern: /\bnike\b/gi, replacement: "ナイキ" }
];

const JAPANESE_SYNONYM_MAP = [
  { pattern: /ポケモンカード/g, alternatives: ["ポケカ"] },
  { pattern: /ルフィ フィギュア/g, alternatives: ["ワンピース ルフィ フィギュア"] },
  { pattern: /フィギュア/g, alternatives: ["figure"] },
  { pattern: /バッグ/g, alternatives: ["bag"] },
  { pattern: /ニンテンドースイッチ 本体/g, alternatives: ["ニンテンドースイッチ"] }
];

const JAPANESE_EXPANSION_MAP = [
  { pattern: /\b(luffy|ルフィ)\b/i, expansions: ["ワンピース ルフィ"] },
  { pattern: /\b(naruto|ナルト)\b/i, expansions: ["ナルト"] },
  { pattern: /\b(pokemon|ポケモン)\b/i, expansions: ["ポケモン"] }
];

const CATEGORY_FALLBACKS = {
  Figures: "フィギュア",
  Anime: "アニメ",
  Games: "ゲーム",
  Fashion: "ファッション",
  Beauty: "コスメ",
  Collectibles: "コレクション",
  Electronics: "電子機器",
  Home: "生活雑貨"
};

const LOW_BUDGET_HINTS = {
  Collectibles: 5000,
  Figures: 7000,
  Games: 25000,
  Fashion: 8000,
  Beauty: 4000,
  Electronics: 30000,
  Home: 5000
};

const logAiSearchDebug = (label, payload) => {
  try {
    console.info(`[ai-shopping-search] ${label}`, payload);
  } catch {
    // Ignore logging failures.
  }
};

const logProviderStage = ({ provider, keyword = "", sourceConfidence = "needs_confirmation", resultCount = 0, status = "ok", detail = "" }) => {
  logAiSearchDebug("provider-stage", {
    provider,
    keyword,
    sourceConfidence,
    resultCount,
    status,
    detail
  });
};

const normalizeUserMessage = (message = "") =>
  TYPO_NORMALIZATIONS.reduce((current, entry) => current.replace(entry.pattern, entry.replacement), String(message || ""));

const normalizeForCache = (value = "") => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

const makeCacheKey = (filters, requestSignature = "") =>
  JSON.stringify({
    keyword: normalizeForCache(filters.keyword),
    sources: [...(filters.preferredSources || [])].sort(),
    maxPriceJPY: filters.maxPriceJPY || 0,
    category: normalizeForCache(filters.category),
    requestSignature: normalizeForCache(requestSignature)
  });

const readCache = (cacheKey) => {
  const cached = aiSearchCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    aiSearchCache.delete(cacheKey);
    return null;
  }
  return cached.payload;
};

const writeCache = (cacheKey, payload) => {
  aiSearchCache.set(cacheKey, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
};

const extractPriceFromText = (value = "") => {
  const text = String(value || "");
  const match =
    text.match(/\b(?:under|below|less\s+than|up\s+to|max|maximum|budget)\s*(?:of|is|around|about)?\s*(?:jpy)?\s*(\d[\d,]*)/i) ||
    text.match(/\b(?:jpy)\s*(\d[\d,]*)\b/i) ||
    text.match(/\b(\d[\d,]*)\s*(?:yen|jpy)\b/i) ||
    text.match(/(?:¥|円)\s*(\d[\d,]*)/i) ||
    text.match(/\b(\d[\d,]*)\s*(?:¥|円)/i);
  const parsed = Number(String(match?.[1] || "").replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
};

const extractFormattedFields = (message = "") => {
  const text = String(message || "");
  const pattern =
    /^\s*(Keyword|Max|Category|Sources)\s*:\s*(.*?)\s*(?=^\s*(?:Keyword|Max|Category|Sources)\s*:|\s*$)/gims;
  const fields = {};

  for (const match of text.matchAll(pattern)) {
    const key = String(match[1] || "").trim().toLowerCase();
    const value = String(match[2] || "").trim();
    if (key && value) {
      fields[key] = value;
    }
  }

  return fields;
};

const extractPreferredSources = (message) => {
  const matches = SOURCE_ALIASES.filter((source) => source.patterns.some((pattern) => pattern.test(message))).map(
    (source) => source.key
  );
  return matches.length ? [...new Set(matches)] : marketplaceSourceKeys;
};

const extractCategory = (message) => {
  const match = CATEGORY_HINTS.find((hint) => hint.patterns.some((pattern) => pattern.test(message)));
  return match?.category || "";
};

const cleanKeyword = (value = "", category = "") => {
  const stripped = KEYWORD_STRIP_PATTERNS.reduce((current, pattern) => current.replace(pattern, " "), String(value || ""))
    .replace(/[|:,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (stripped) return stripped;
  if (category) return category;
  return String(value || "").trim();
};

const parseUserMessage = (message = "") => {
  const normalizedMessage = normalizeUserMessage(message);
  const formattedFields = extractFormattedFields(normalizedMessage);

  if (Object.keys(formattedFields).length > 0) {
    const category = String(formattedFields.category || "").trim();
    const rawKeyword = String(formattedFields.keyword || "").trim();
    const inlinePrice = extractPriceFromText(rawKeyword);
    const explicitPrice = extractPriceFromText(formattedFields.max || "");
    const preferredSources = extractPreferredSources(String(formattedFields.sources || ""));

    return {
      keyword: cleanKeyword(rawKeyword, category),
      maxPriceJPY: explicitPrice || inlinePrice,
      category,
      preferredSources
    };
  }

  const category = extractCategory(normalizedMessage);
  return {
    keyword: cleanKeyword(normalizedMessage, category),
    maxPriceJPY: extractPriceFromText(normalizedMessage),
    category,
    preferredSources: extractPreferredSources(normalizedMessage)
  };
};

const buildJapaneseKeyword = (keyword = "", category = "") => {
  const translated = JAPANESE_TERM_MAP.reduce(
    (current, entry) => current.replace(entry.pattern, entry.replacement),
    String(keyword || "")
  )
    .replace(/\s+/g, " ")
    .trim();

  if (translated && translated !== keyword) return translated;
  if (translated) return translated;
  return CATEGORY_FALLBACKS[category] || "";
};

const dedupeStrings = (values = []) => [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];

const buildJapaneseKeywordVariants = (keyword = "") => {
  const base = String(keyword || "").trim();
  const variants = [base];

  for (const entry of JAPANESE_SYNONYM_MAP) {
    if (entry.pattern.test(base)) {
      for (const alternative of entry.alternatives) {
        variants.push(base.replace(entry.pattern, alternative));
      }
      entry.pattern.lastIndex = 0;
    }
  }

  return dedupeStrings(variants);
};

const buildExpandedJapaneseQueries = (keyword = "") => {
  const base = String(keyword || "").trim();
  if (!base) return [];

  const expansions = [];
  for (const entry of JAPANESE_EXPANSION_MAP) {
    if (!entry.pattern.test(base)) continue;
    for (const prefix of entry.expansions) {
      expansions.push(base.includes(prefix) ? base : `${prefix} ${base}`.replace(/\s+/g, " ").trim());
    }
  }

  return dedupeStrings(expansions);
};

const buildBroaderKeywordVariants = (keyword = "", category = "") => {
  const base = String(keyword || "").trim();
  if (!base) return [];

  const variants = [base];
  const compact = base.replace(/\s+/g, "");
  if (compact && compact !== base) variants.push(compact);
  if (category) variants.push(`${base} ${category}`);

  return dedupeStrings(variants);
};

const buildLocalRewrite = (filters = {}) => {
  const japaneseKeyword = buildJapaneseKeyword(filters.keyword, filters.category);
  const lowBudgetHint = shouldUseLowBudgetHint(filters.maxPriceJPY, filters.category);
  const baseJapaneseQueries = dedupeStrings([
    japaneseKeyword,
    ...buildExpandedJapaneseQueries(japaneseKeyword),
    ...buildJapaneseKeywordVariants(japaneseKeyword)
  ]);
  const primaryJapaneseQueries = dedupeStrings(
    baseJapaneseQueries.flatMap((keyword) =>
      lowBudgetHint ? [keyword, `${keyword} 安い`] : [keyword]
    )
  );
  const broaderJapaneseQueries = dedupeStrings(
    baseJapaneseQueries.flatMap((keyword) => [`${keyword} 安い`, `${keyword} まとめ売り`, `${keyword} 中古`])
  );

  return {
    cleanKeywordEnglish: String(filters.keyword || "").trim(),
    japaneseQueries: primaryJapaneseQueries,
    broaderJapaneseQueries,
    maxPriceJPY: filters.maxPriceJPY || null,
    preferredSources: Array.isArray(filters.preferredSources) && filters.preferredSources.length
      ? filters.preferredSources
      : marketplaceSourceKeys
  };
};

const rewriteSearchQuery = async (_userMessage, parsedFilters = {}) => buildLocalRewrite(parsedFilters);

const buildLegacyFallbackQueries = (filters = {}) => {
  const japaneseKeyword = buildJapaneseKeyword(filters.keyword, filters.category);
  const lowBudgetHint = shouldUseLowBudgetHint(filters.maxPriceJPY, filters.category);
  return {
    japaneseKeyword,
    expandedJapaneseQueries: dedupeStrings(
    buildExpandedJapaneseQueries(japaneseKeyword).flatMap((keyword) =>
      lowBudgetHint ? [keyword, `${keyword} 安い`, `${keyword} 格安`] : [keyword]
    )
    ),
    simpleJapaneseQueries: dedupeStrings(
      buildJapaneseKeywordVariants(japaneseKeyword).flatMap((keyword) =>
        lowBudgetHint ? [keyword, `${keyword} 安い`, `${keyword} 格安`] : [keyword]
      )
    )
  };
};

const shouldUseLowBudgetHint = (maxPriceJPY, category = "") => {
  if (!maxPriceJPY) return false;
  const threshold = LOW_BUDGET_HINTS[category] || 5000;
  return Number(maxPriceJPY) <= threshold;
};

const buildSearchQuery = ({ keyword, preferredSources, strictMode }) => {
  const parts = [keyword];
  const siteFilters = preferredSources
    .filter((sourceKey) => sourceKey !== "mercari")
    .map((sourceKey) =>
      strictMode ? SOURCE_SEARCH_CONFIG[sourceKey]?.siteFilterStrict : SOURCE_SEARCH_CONFIG[sourceKey]?.siteFilterRelaxed
    )
    .filter(Boolean);

  if (siteFilters.length > 0) {
    parts.push(siteFilters.length === 1 ? siteFilters[0] : `(${siteFilters.join(" OR ")})`);
  }

  return parts.filter(Boolean).join(" ");
};

const getSourceDomain = (value = "") => {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
};

const decodeHtmlEntities = (value = "") =>
  String(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();

const normalizeDecodedText = (value = "") =>
  decodeHtmlEntities(String(value || ""))
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .normalize("NFKC")
    .trim();

const isLikelyBrokenTitle = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return true;

  const replacementCount = (text.match(/\uFFFD|�/g) || []).length;
  if (replacementCount >= 2) return true;
  if (replacementCount > 0 && replacementCount / Math.max(text.length, 1) > 0.08) return true;

  const suspiciousCount = (text.match(/[ÃÂÐØ�]/g) || []).length;
  if (suspiciousCount >= 4 && suspiciousCount / Math.max(text.length, 1) > 0.12) return true;

  return false;
};

const getHeaderCharset = (response) => {
  const contentType = String(response?.headers?.get("content-type") || "");
  const match = contentType.match(/charset\s*=\s*["']?\s*([^;"'\s]+)/i);
  return match?.[1] ? match[1].trim().toLowerCase() : "";
};

const getMetaCharset = (rawAsciiHtml = "") => {
  const headSnippet = String(rawAsciiHtml || "").slice(0, 8192);
  const directCharsetMatch = headSnippet.match(/<meta[^>]+charset\s*=\s*["']?\s*([^"'>\s/]+)/i);
  if (directCharsetMatch?.[1]) return directCharsetMatch[1].trim().toLowerCase();

  const contentTypeMatch = headSnippet.match(
    /<meta[^>]+http-equiv\s*=\s*["']content-type["'][^>]+content\s*=\s*["'][^"']*charset\s*=\s*([^"'>\s;]+)/i
  );
  return contentTypeMatch?.[1] ? contentTypeMatch[1].trim().toLowerCase() : "";
};

const normalizeCharset = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (["shift-jis", "shiftjis", "sjis", "ms_kanji", "windows-31j", "cp932"].includes(normalized)) return "shift_jis";
  if (["euc-jp", "eucjp"].includes(normalized)) return "euc-jp";
  if (["iso-2022-jp", "jis"].includes(normalized)) return "iso-2022-jp";
  if (["utf8", "utf-8"].includes(normalized)) return "utf-8";
  return normalized;
};

const decodeBytesWithCharset = (buffer, charset = "utf-8") => {
  try {
    const decoder = new TextDecoder(normalizeCharset(charset) || "utf-8", { fatal: false });
    return normalizeDecodedText(decoder.decode(buffer));
  } catch {
    return "";
  }
};

const getCharsetCandidates = ({ response, rawAsciiHtml, domain = "" }) => {
  const candidates = [
    getHeaderCharset(response),
    getMetaCharset(rawAsciiHtml),
    domain === "item.rakuten.co.jp" || domain === "search.rakuten.co.jp" ? "shift_jis" : "",
    domain === "amazon.co.jp" ? "utf-8" : "",
    "utf-8",
    "shift_jis",
    "euc-jp",
    "iso-2022-jp"
  ];

  return [...new Set(candidates.map(normalizeCharset).filter(Boolean))];
};

const scoreDecodedHtml = (html = "") => {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = normalizeDecodedText(titleMatch?.[1] || "");
  const replacementCount = (html.match(/\uFFFD|�/g) || []).length;
  let score = replacementCount * 8;
  if (!title) score += 25;
  if (isLikelyBrokenTitle(title)) score += 40;
  return { score, title };
};

const decodeHtmlFromResponse = async (response, pageUrl = "") => {
  const buffer = Buffer.from(await response.arrayBuffer());
  const rawAsciiHtml = buffer.toString("latin1");
  const domain = getSourceDomain(pageUrl || response.url || "");
  const candidates = getCharsetCandidates({ response, rawAsciiHtml, domain });

  let bestHtml = "";
  let bestScore = Number.POSITIVE_INFINITY;
  let bestCharset = candidates[0] || "utf-8";

  for (const charset of candidates) {
    const decoded = decodeBytesWithCharset(buffer, charset);
    if (!decoded) continue;
    const { score } = scoreDecodedHtml(decoded);
    if (score < bestScore) {
      bestHtml = decoded;
      bestScore = score;
      bestCharset = charset;
    }
  }

  return {
    html: bestHtml || decodeBytesWithCharset(buffer, "utf-8"),
    charset: bestCharset
  };
};

const isRakumaProductUrl = (value = "") => {
  try {
    const url = new URL(value);
    return url.hostname === "item.fril.jp" && /^\/[a-f0-9]+$/i.test(url.pathname);
  } catch {
    return false;
  }
};

const isAmazonProductUrl = (value = "") => {
  try {
    const url = new URL(value);
    return (
      url.hostname.endsWith("amazon.co.jp") &&
      (url.pathname.includes("/dp/") || url.pathname.includes("/gp/product/")) &&
      !url.pathname.startsWith("/s") &&
      !/^\/(?:stores|gp\/stores|brand|b)\b/i.test(url.pathname)
    );
  } catch {
    return false;
  }
};

const isRakutenProductUrl = (value = "") => {
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    if (url.hostname !== "item.rakuten.co.jp" || segments.length < 2) return false;
    const path = `/${segments.join("/")}/`;
    return !/(?:campaign|event|ranking|category|search|shop|contents|special)/i.test(path);
  } catch {
    return false;
  }
};

const isRakutenSearchUrl = (value = "") => {
  try {
    const url = new URL(value);
    return url.hostname === "search.rakuten.co.jp";
  } catch {
    return false;
  }
};

const isYahooProductUrl = (value = "") => {
  try {
    const url = new URL(value);
    if (url.hostname === "shopping.yahoo.co.jp") {
      return /^\/products\/[a-z0-9]+/i.test(url.pathname);
    }
    if (url.hostname === "store.shopping.yahoo.co.jp") {
      return /\.html$/i.test(url.pathname);
    }
    return false;
  } catch {
    return false;
  }
};

const matchesRequestedProductPage = (value = "", preferredSources = []) => {
  const checks = {
    rakuma: isRakumaProductUrl,
    amazon: isAmazonProductUrl,
    rakuten: isRakutenProductUrl,
    yahoo: isYahooProductUrl
  };
  return preferredSources.some((sourceKey) => checks[sourceKey]?.(value));
};

const isAllowedMarketplaceDomain = (value = "", allowedDomains = []) => {
  const domain = getSourceDomain(value);
  return allowedDomains.some((allowedDomain) => domain === allowedDomain || domain.endsWith(`.${allowedDomain}`));
};

const isStrictAllowedSourceResult = (value = "", preferredSources = []) => {
  const domain = getSourceDomain(value);
  if (!domain) return false;

  if (preferredSources.includes("yahoo")) {
    return domain === "shopping.yahoo.co.jp" || domain === "store.shopping.yahoo.co.jp";
  }

  return true;
};

const getAmazonProductPageScore = (value = "") => {
  try {
    const url = new URL(value);
    if (!url.hostname.endsWith("amazon.co.jp")) return 0;
    if (url.pathname.includes("/dp/")) return 96;
    if (url.pathname.includes("/gp/product/")) return 92;
    if (/^\/s\b/i.test(url.pathname) || /^\/(?:stores|gp\/stores|brand|b)\b/i.test(url.pathname)) return 5;
    return 20;
  } catch {
    return 0;
  }
};

const getRakutenProductPageScore = (value = "") => {
  try {
    const url = new URL(value);
    if (url.hostname === "search.rakuten.co.jp") return 10;
    if (url.hostname !== "item.rakuten.co.jp") return 0;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return 15;
    const path = `/${segments.join("/")}/`;
    if (/(?:campaign|event|ranking|category|search|shop|contents|special)/i.test(path)) return 20;
    return 94;
  } catch {
    return 0;
  }
};

const getProductPageScore = (value = "", source = "") => {
  if (source === "amazon" || /amazon\.co\.jp$/i.test(getSourceDomain(value))) {
    return getAmazonProductPageScore(value);
  }
  if (source === "rakuten" || getSourceDomain(value) === "item.rakuten.co.jp" || isRakutenSearchUrl(value)) {
    return getRakutenProductPageScore(value);
  }
  if (source === "mercari") return String(value).includes("/item/") ? 95 : 20;
  if (source === "rakuma") return isRakumaProductUrl(value) ? 92 : 20;
  if (source === "yahoo") return isYahooProductUrl(value) ? 92 : 20;
  return 70;
};

const MIN_PRODUCT_PAGE_SCORE = 60;

const confidenceRank = {
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0,
  structured: 3,
  visible: 2
};

const dedupeResults = (results = []) => {
  const seen = new Set();
  return results.filter((result) => {
    const key = String(result?.productUrl || "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const isAuctionLikeResult = (result = {}) => {
  const url = String(result?.productUrl || result?.url || "").trim();
  const title = String(result?.title || "").trim();
  const source = String(result?.source || "").trim();
  const combinedText = `${title} ${source}`;

  if (/auctions\.yahoo\.co\.jp/i.test(url)) return true;
  if (/\/auction\//i.test(url)) return true;

  return AUCTION_BLOCK_PATTERNS.some((pattern) => pattern.test(url) || pattern.test(combinedText));
};

const sortResults = (results = []) =>
  [...results].sort((left, right) => {
    const relevanceDelta = Number(right?.relevanceScore || 0) - Number(left?.relevanceScore || 0);
    if (relevanceDelta !== 0) return relevanceDelta;

    const leftScore = Number(left?.productPageScore || getProductPageScore(left?.productUrl || "", left?.source || ""));
    const rightScore = Number(right?.productPageScore || getProductPageScore(right?.productUrl || "", right?.source || ""));
    const scoreDelta = rightScore - leftScore;
    if (scoreDelta !== 0) return scoreDelta;

    const imageDelta = (confidenceRank[right?.imageConfidence] || 0) - (confidenceRank[left?.imageConfidence] || 0);
    if (imageDelta !== 0) return imageDelta;

    const priceDelta = (confidenceRank[right?.priceConfidence] || 0) - (confidenceRank[left?.priceConfidence] || 0);
    if (priceDelta !== 0) return priceDelta;

    return Number(right?.priceJPY || 0) - Number(left?.priceJPY || 0);
  });

const finalizeResults = (results = []) =>
  sortResults(
    dedupeResults(results).filter(
      (result) =>
        !isAuctionLikeResult(result) &&
        Number(result?.productPageScore || getProductPageScore(result?.productUrl || "", result?.source || "")) >= MIN_PRODUCT_PAGE_SCORE
    )
  ).slice(
    0,
    FINAL_RESULT_LIMIT
  );

const normalizeSearchText = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenizeSearchText = (value = "") =>
  normalizeSearchText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

const hasCollectibleIntent = (keyword = "") => /(pokemon|ポケモン|ポケカ|card|cards|カード|figure|フィギュア|bag|バッグ|shoe|shoes|靴|sneaker)/i.test(String(keyword || ""));

const getRakutenTitleRelevanceScore = (title = "", keyword = "") => {
  const normalizedTitle = normalizeSearchText(title);
  const tokens = tokenizeSearchText(keyword);
  if (!normalizedTitle || !tokens.length) return 0;

  let score = 0;
  const matchedTokens = tokens.filter((token) => normalizedTitle.includes(token));
  score += matchedTokens.length * 18;

  if (matchedTokens.length === tokens.length) score += 18;
  if (hasCollectibleIntent(keyword) && /(ケース|box 保護|保護ケース|ローダー|スリーブ|holder|cover|storage|shop|公式 楽天市場店)/i.test(title)) {
    score -= 26;
  }
  if (/(通販|ランキング|特集|キャンペーン)/i.test(title)) {
    score -= 18;
  }
  if (/(中古)/i.test(title) && !/(中古|used)/i.test(keyword)) {
    score -= 8;
  }

  return score;
};

const getSourceConfidence = (value = "needs_confirmation") =>
  value === "official" ? "official" : "needs_confirmation";

const isMercariDomain = (value = "") => getSourceDomain(value) === "jp.mercari.com";

const detectMercariSoldOut = (html = "") => {
  const text = normalizeDecodedText(stripHtmlTags(html));

  for (const entry of MERCARI_SOLD_OUT_PATTERNS) {
    if (entry.pattern.test(html) || entry.pattern.test(text)) {
      return { soldOut: true, reason: entry.reason };
    }
  }

  if (
    /<button[^>]+disabled[^>]*>[\s\S]{0,120}?(?:購入|buy|購入手続き)/i.test(html) ||
    /aria-disabled=["']true["'][\s\S]{0,120}?(?:購入|buy|購入手続き)/i.test(html)
  ) {
    return { soldOut: true, reason: "disabled_purchase_button" };
  }

  if (/listingStatus[\s\S]{0,80}(?:sold|unavailable)/i.test(html)) {
    return { soldOut: true, reason: "listing_status_unavailable" };
  }

  return { soldOut: false, reason: "available_or_unknown" };
};

const detectAuctionListing = ({ html = "", domain = "", title = "", productUrl = "" } = {}) => {
  const text = normalizeDecodedText(stripHtmlTags(html));
  const normalizedDomain = String(domain || "").toLowerCase();
  const combined = `${title} ${text} ${productUrl}`;

  if (/auctions\.yahoo\.co\.jp/i.test(productUrl) || /\/auction\//i.test(productUrl)) {
    return { isAuction: true, reason: "auction_url" };
  }

  if (
    normalizedDomain === "jp.mercari.com" &&
    (/オークション商品/i.test(combined) || /入札する/i.test(combined) || /終了予定時刻/i.test(combined) || /入札/i.test(combined))
  ) {
    return { isAuction: true, reason: "mercari_auction_page" };
  }

  if (/\bauction\b/i.test(combined) || /\bbid(?:ding)?\b/i.test(combined) || /オークション/i.test(combined) || /入札/i.test(combined)) {
    return { isAuction: true, reason: "auction_text" };
  }

  return { isAuction: false, reason: "fixed_price_or_unknown" };
};

const createOfficialResult = ({
  title,
  image = "",
  priceJPY = null,
  priceConfidence = "unknown",
  imageConfidence = "unknown",
  source,
  productUrl,
  relevanceScore = 0
}) => ({
  title: normalizeDecodedText(title) || source,
  image,
  priceJPY: Number.isFinite(Number(priceJPY)) && Number(priceJPY) > 0 ? Math.round(Number(priceJPY)) : null,
  priceConfidence,
  imageConfidence,
  productPageScore: 100,
  relevanceScore,
  source,
  productUrl,
  searchKeyword: "",
  sourceConfidence: "official"
});

const mapBraveResultToProduct = (result = {}, searchKeyword = "") => {
  const url = String(result.url || "").trim();
  const title = String(result.title || "").trim();
  const source = getSourceDomain(url) || "Web";
  const thumbnail =
    String(result?.thumbnail?.src || "").trim() ||
    String(result?.profile?.img || "").trim() ||
    String(result?.meta_url?.favicon || "").trim();
  return {
    title: title || source,
    image: thumbnail,
    priceJPY: null,
    priceConfidence: "unknown",
    imageConfidence: thumbnail ? "low" : "unknown",
    productPageScore: getProductPageScore(url),
    relevanceScore: source === "item.rakuten.co.jp" ? getRakutenTitleRelevanceScore(title, searchKeyword) : 0,
    searchKeyword,
    sourceConfidence: "needs_confirmation",
    source,
    productUrl: url
  };
};

const getJsonLdObjects = (html = "") => {
  const objects = [];
  const scriptPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    const rawContent = match?.[1]?.trim();
    if (!rawContent) continue;
    try {
      objects.push(JSON.parse(rawContent));
    } catch {
      continue;
    }
  }
  return objects;
};

const getMetaContent = (html, attribute, key) => {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+${attribute}\\s*=\\s*["']${escapedKey}["'][^>]+content\\s*=\\s*["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]+${attribute}\\s*=\\s*["']${escapedKey}["'][^>]*>`,
      "i"
    )
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]);
  }

  return "";
};

const getFirstLargeImage = (html, baseUrl) => {
  const imagePatterns = [
    /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]+(?:width\s*=\s*["']([3-9]\d{2,}|[1-9]\d{3,})["']|class\s*=\s*["'][^"']*(?:product|item|gallery|image)[^"']*["'])[^>]*>/gi,
    /<img[^>]+(?:width\s*=\s*["']([3-9]\d{2,}|[1-9]\d{3,})["'][^>]+)?src\s*=\s*["']([^"']+)["'][^>]*>/gi
  ];

  for (const pattern of imagePatterns) {
    for (const match of html.matchAll(pattern)) {
      const rawSrc = match?.[1]?.startsWith("http") || match?.[1]?.startsWith("/") ? match[1] : match[2];
      if (!rawSrc || /sprite|icon|logo|avatar|badge/i.test(rawSrc)) continue;
      try {
        return new URL(rawSrc, baseUrl).toString();
      } catch {
        continue;
      }
    }
  }

  return "";
};

const isLowConfidenceImageUrl = (value = "") => {
  const candidate = String(value || "").trim().toLowerCase();
  if (!candidate) return true;
  if (/logo|header|banner|shop|noimage|icon|sprite|favicon/.test(candidate)) return true;
  if (/\.svg(?:$|\?)/.test(candidate)) return true;
  return false;
};

const getImageConfidence = (value = "", sourceType = "unknown") => {
  if (!value || isLowConfidenceImageUrl(value)) return "low";
  if (sourceType === "jsonld" || sourceType === "selector") return "high";
  if (sourceType === "og" || sourceType === "amazon-main" || sourceType === "rakuten-main") return "medium";
  if (sourceType === "brave-thumbnail") return "low";
  return "medium";
};

const getDocumentTitle = (html = "") => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return normalizeDecodedText(match?.[1] || "");
};

const collectJsonLdImages = (node, bucket = []) => {
  if (!node) return bucket;
  if (Array.isArray(node)) {
    for (const item of node) {
      collectJsonLdImages(item, bucket);
    }
    return bucket;
  }
  if (typeof node === "string") {
    if (/^https?:\/\//i.test(node)) bucket.push(node);
    return bucket;
  }
  if (typeof node !== "object") return bucket;

  const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]].filter(Boolean);
  const isProduct = types.some((type) => String(type).toLowerCase() === "product");

  if (isProduct && node.image) {
    collectJsonLdImages(node.image, bucket);
  }
  if (Array.isArray(node["@graph"])) {
    collectJsonLdImages(node["@graph"], bucket);
  }
  if (node.image && !isProduct) {
    collectJsonLdImages(node.image, bucket);
  }
  if (node.primaryImageOfPage) {
    collectJsonLdImages(node.primaryImageOfPage, bucket);
  }
  if (node.url && /^https?:\/\//i.test(String(node.url || "")) && /\.(?:jpe?g|png|webp|gif)/i.test(String(node.url || ""))) {
    bucket.push(String(node.url));
  }
  return bucket;
};

const getJsonLdImages = (html = "", baseUrl = "") => {
  const images = [];
  for (const object of getJsonLdObjects(html)) {
    collectJsonLdImages(object, images);
  }

  return [...new Set(images)]
    .map((imageUrl) => {
      try {
        return new URL(imageUrl, baseUrl).toString();
      } catch {
        return "";
      }
    })
    .filter(Boolean);
};

const getAmazonMainImage = (html = "", baseUrl = "") => {
  const selectors = [
    /data-old-hires=["']([^"']+)["']/i,
    /id=["']imgTagWrapperId["'][\s\S]{0,1200}?<img[^>]+src=["']([^"']+)["']/i,
    /id=["']main-image-container["'][\s\S]{0,1200}?<img[^>]+src=["']([^"']+)["']/i,
    /<img[^>]+id=["']landingImage["'][^>]+src=["']([^"']+)["']/i
  ];

  for (const selector of selectors) {
    const match = html.match(selector);
    if (!match?.[1]) continue;
    try {
      const resolved = new URL(match[1], baseUrl).toString();
      if (!isLowConfidenceImageUrl(resolved)) return resolved;
    } catch {
      continue;
    }
  }

  const dynamicImageMatch = html.match(/data-a-dynamic-image=["']([^"']+)["']/i);
  if (dynamicImageMatch?.[1]) {
    const decoded = decodeHtmlEntities(dynamicImageMatch[1]);
    const candidates = [...decoded.matchAll(/https?:\\?\/\\?\/[^"\\]+/gi)]
      .map((match) => match?.[0]?.replace(/\\\//g, "/") || "")
      .filter(Boolean);
    for (const candidate of candidates) {
      try {
        const resolved = new URL(candidate, baseUrl).toString();
        if (!isLowConfidenceImageUrl(resolved)) return resolved;
      } catch {
        continue;
      }
    }
  }

  return "";
};

const getRakutenMainImage = (html = "", baseUrl = "") => {
  const patterns = [
    /<img[^>]+(?:id|class)=["'][^"']*(?:item-image|product-image|main-image|displayImage)[^"']*["'][^>]+src=["']([^"']+)["']/i,
    /<img[^>]+src=["']([^"']+)["'][^>]+(?:id|class)=["'][^"']*(?:item-image|product-image|main-image|displayImage)[^"']*["']/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;
    try {
      return new URL(match[1], baseUrl).toString();
    } catch {
      continue;
    }
  }

  return "";
};

const normalizePrice = (value) => {
  if (value == null) return null;
  const parsed = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
};

const collectJsonLdPrices = (node, bucket = []) => {
  if (!node) return bucket;
  if (Array.isArray(node)) {
    for (const item of node) {
      collectJsonLdPrices(item, bucket);
    }
    return bucket;
  }
  if (typeof node !== "object") return bucket;

  const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]].filter(Boolean);
  const isProduct = types.some((type) => String(type).toLowerCase() === "product");

  if (isProduct) {
    collectJsonLdPrices(node.offers, bucket);
  }
  if (node.price != null) {
    const parsedPrice = normalizePrice(node.price);
    if (parsedPrice) bucket.push(parsedPrice);
  }
  if (node.offers) {
    collectJsonLdPrices(node.offers, bucket);
  }
  if (Array.isArray(node["@graph"])) {
    collectJsonLdPrices(node["@graph"], bucket);
  }
  return bucket;
};

const getJsonLdPrices = (html) => {
  const prices = [];
  for (const object of getJsonLdObjects(html)) {
    collectJsonLdPrices(object, prices);
  }
  return prices.filter((price, index, allPrices) => Number.isFinite(price) && price > 0 && allPrices.indexOf(price) === index);
};

const getStructuredMetaPrices = (html) =>
  [
    normalizePrice(getMetaContent(html, "property", "product:price:amount")),
    normalizePrice(getMetaContent(html, "property", "og:price:amount")),
    normalizePrice(getMetaContent(html, "name", "price")),
    normalizePrice(getMetaContent(html, "name", "twitter:data1"))
  ].filter((price) => Number.isFinite(price) && price > 0);

const getSafeMarketplacePrice = (html) => {
  const candidates = [...getJsonLdPrices(html), ...getStructuredMetaPrices(html)].filter(
    (price) => Number.isFinite(price) && price > 0
  );

  if (!candidates.length) return null;
  return Math.max(...candidates);
};

const hmac = (key, value, encoding) => crypto.createHmac("sha256", key).update(value, "utf8").digest(encoding);

const signAmazonPaapiRequest = ({ accessKey, secretKey, payload, amzDate, dateStamp }) => {
  const payloadHash = crypto.createHash("sha256").update(payload, "utf8").digest("hex");
  const canonicalHeaders =
    `content-encoding:amz-1.0\ncontent-type:application/json; charset=utf-8\nhost:${AMAZON_PAAPI_HOST}\nx-amz-date:${amzDate}\nx-amz-target:com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems\n`;
  const signedHeaders = "content-encoding;content-type;host;x-amz-date;x-amz-target";
  const canonicalRequest = ["POST", AMAZON_PAAPI_PATH, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${AMAZON_PAAPI_REGION}/ProductAdvertisingAPI/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    crypto.createHash("sha256").update(canonicalRequest, "utf8").digest("hex")
  ].join("\n");

  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, AMAZON_PAAPI_REGION);
  const kService = hmac(kRegion, "ProductAdvertisingAPI");
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign, "hex");

  return `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
};

const searchAmazonWithOfficialApi = async (keyword = "") => {
  const accessKey = String(process.env.AMAZON_ACCESS_KEY || "").trim();
  const secretKey = String(process.env.AMAZON_SECRET_KEY || "").trim();
  const associateTag = String(process.env.AMAZON_ASSOCIATE_TAG || "").trim();
  if (!keyword) return [];
  if (!accessKey || !secretKey || !associateTag) {
    logProviderStage({
      provider: "amazon_paapi",
      keyword,
      sourceConfidence: "official",
      resultCount: 0,
      status: "skipped",
      detail: "missing_credentials"
    });
    return [];
  }

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "").replace("Z", "Z");
  const dateStamp = amzDate.slice(0, 8);
  const requestBody = JSON.stringify({
    Keywords: keyword,
    SearchIndex: "All",
    ItemCount: 10,
    PartnerTag: associateTag,
    PartnerType: "Associates",
    Marketplace: "www.amazon.co.jp",
    Resources: ["Images.Primary.Large", "ItemInfo.Title", "Offers.Listings.Price"]
  });

  const authorization = signAmazonPaapiRequest({ accessKey, secretKey, payload: requestBody, amzDate, dateStamp });
  try {
    const response = await fetch(`https://${AMAZON_PAAPI_HOST}${AMAZON_PAAPI_PATH}`, {
      method: "POST",
      headers: {
        "Content-Encoding": "amz-1.0",
        "Content-Type": "application/json; charset=utf-8",
        Host: AMAZON_PAAPI_HOST,
        "X-Amz-Date": amzDate,
        "X-Amz-Target": "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems",
        Authorization: authorization
      },
      body: requestBody
    });

    if (!response.ok) {
      logProviderStage({
        provider: "amazon_paapi",
        keyword,
        sourceConfidence: "official",
        resultCount: 0,
        status: "error",
        detail: `http_${response.status}`
      });
      return [];
    }

    const payload = await response.json();
    const items = Array.isArray(payload?.SearchResult?.Items) ? payload.SearchResult.Items : [];
    const results = items
      .map((item) => {
        const productUrl = String(item?.DetailPageURL || "").trim();
        if (!isAmazonProductUrl(productUrl)) return null;

        const title = item?.ItemInfo?.Title?.DisplayValue || "";
        const image = item?.Images?.Primary?.Large?.URL || item?.Images?.Primary?.Medium?.URL || "";
        const priceAmount =
          item?.Offers?.Listings?.[0]?.Price?.Amount ??
          item?.OffersV2?.Listings?.[0]?.Price?.Amount ??
          item?.OffersV2?.Summaries?.[0]?.LowestPrice?.Amount ??
          null;

        return createOfficialResult({
          title,
          image: !isLowConfidenceImageUrl(image) ? image : "",
          imageConfidence: !isLowConfidenceImageUrl(image) ? "high" : "unknown",
          priceJPY: normalizePrice(priceAmount),
          priceConfidence: normalizePrice(priceAmount) ? "structured" : "unknown",
          source: "amazon.co.jp",
          productUrl
        });
      })
      .filter(Boolean);

    logProviderStage({
      provider: "amazon_paapi",
      keyword,
      sourceConfidence: "official",
      resultCount: results.length,
      status: "ok"
    });
    return results;
  } catch (error) {
    logProviderStage({
      provider: "amazon_paapi",
      keyword,
      sourceConfidence: "official",
      resultCount: 0,
      status: "error",
      detail: error?.message || "request_failed"
    });
    return [];
  }
};

const searchRakutenWithOfficialApi = async (keyword = "") => {
  const appId = String(process.env.RAKUTEN_APP_ID || "").trim();
  if (!keyword) return [];
  if (!appId) {
    logProviderStage({
      provider: "rakuten_api",
      keyword,
      sourceConfidence: "official",
      resultCount: 0,
      status: "skipped",
      detail: "missing_app_id"
    });
    return [];
  }

  const params = new URLSearchParams({
    applicationId: appId,
    keyword,
    format: "json",
    formatVersion: "2",
    hits: "10",
    sort: "+itemPrice"
  });

  try {
    const response = await fetch(`https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601?${params.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      logProviderStage({
        provider: "rakuten_api",
        keyword,
        sourceConfidence: "official",
        resultCount: 0,
        status: "error",
        detail: `http_${response.status}`
      });
      return [];
    }

    const payload = await response.json();
    const items = Array.isArray(payload?.Items || payload?.items) ? payload.Items || payload.items : [];
    const results = items
      .map((item) => {
        const productUrl = String(item?.itemUrl || "").trim();
        if (!isRakutenProductUrl(productUrl)) return null;

        const image =
          item?.mediumImageUrls?.[0]?.imageUrl ||
          item?.smallImageUrls?.[0]?.imageUrl ||
          item?.mediumImageUrls?.[0] ||
          "";
        const title = item?.itemName || "";
        const price = normalizePrice(item?.itemPrice);

        return createOfficialResult({
          title,
          image: !isLowConfidenceImageUrl(image) ? image : "",
          imageConfidence: !isLowConfidenceImageUrl(image) ? "high" : "unknown",
          priceJPY: price,
          priceConfidence: price ? "structured" : "unknown",
          source: "item.rakuten.co.jp",
          productUrl,
          relevanceScore: getRakutenTitleRelevanceScore(title, keyword)
        });
      })
      .filter(Boolean);

    logProviderStage({
      provider: "rakuten_api",
      keyword,
      sourceConfidence: "official",
      resultCount: results.length,
      status: "ok"
    });
    return results;
  } catch (error) {
    logProviderStage({
      provider: "rakuten_api",
      keyword,
      sourceConfidence: "official",
      resultCount: 0,
      status: "error",
      detail: error?.message || "request_failed"
    });
    return [];
  }
};

const searchOfficialProvider = async ({ sourceKey, keyword }) => {
  if (sourceKey === "amazon") return searchAmazonWithOfficialApi(keyword);
  if (sourceKey === "rakuten") return searchRakutenWithOfficialApi(keyword);
  return [];
};

const getAmazonVisiblePrice = (html = "") => {
  const patterns = [
    /id=["']corePriceDisplay_desktop_feature_div["'][\s\S]{0,1200}?(?:¥|￥)\s*([\d,]{3,})/i,
    /id=["']corePrice_feature_div["'][\s\S]{0,1200}?(?:¥|￥)\s*([\d,]{3,})/i,
    /id=["']priceblock_ourprice["'][\s\S]{0,400}?(?:¥|￥)\s*([\d,]{3,})/i,
    /id=["']priceblock_dealprice["'][\s\S]{0,400}?(?:¥|￥)\s*([\d,]{3,})/i,
    /id=["']apex_desktop["'][\s\S]{0,1800}?class=["'][^"']*a-price-whole[^"']*["'][^>]*>\s*([\d,]{3,})/i,
    /id=["']twister-plus-price-data-price["'][^>]*value=["']([\d,]{3,})["']/i,
    /name=["']twitter:data1["'][^>]+content=["'][^0-9]*([\d,]{3,})/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const price = normalizePrice(match?.[1] || "");
    if (price) return price;
  }

  return null;
};

const getRakutenVisiblePrice = (html = "") => {
  const patterns = [
    /(?:価格|販売価格|税込価格)[^¥￥0-9]{0,20}(?:¥|￥)?\s*([\d,]{3,})\s*(?:円|税込)?/i,
    /<span[^>]+(?:id|class)=["'][^"']*(?:price|item_price|sales-price)[^"']*["'][^>]*>\s*(?:¥|￥)?\s*([\d,]{3,})\s*(?:円|税込)?/i,
    /<div[^>]+(?:id|class)=["'][^"']*(?:price|item_price|sales-price)[^"']*["'][\s\S]{0,240}?(?:¥|￥)\s*([\d,]{3,})\s*(?:円|税込|税別)?/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const price = normalizePrice(match?.[1] || "");
    if (price && price >= 100) return price;
  }

  return null;
};

const stripHtmlTags = (value = "") =>
  decodeHtmlEntities(String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " "))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getVisibleMainPrice = (html = "") => {
  const blockedTextPattern =
    /recommended|recommendation|related items|you may also like|lowest price|accessor(?:y|ies)|option|variant|ranking|review|news|finance|おすすめ|関連商品|最安|アクセサリ|オプション|バリエーション|ランキング/i;
  const mainPriceBlockPattern =
    /<(section|div|article|main|span|p|li)[^>]+(?:id|class)\s*=\s*["'][^"']*(?:product|item|price|sales-price|current-price|purchase-price|offer-price|detail-price)[^"']*["'][^>]*>[\s\S]{0,1600}?<\/\1>/gi;
  const visiblePricePattern = /(?:¥|￥)\s*([\d,]{3,})|([\d,]{3,})\s*円/g;
  const candidates = [];

  for (const match of html.matchAll(mainPriceBlockPattern)) {
    const blockHtml = match?.[0] || "";
    const blockText = stripHtmlTags(blockHtml);
    if (!blockText || blockedTextPattern.test(blockText)) continue;

    const blockPrices = [];
    for (const priceMatch of blockText.matchAll(visiblePricePattern)) {
      const rawValue = priceMatch?.[1] || priceMatch?.[2] || "";
      const parsedValue = normalizePrice(rawValue);
      if (parsedValue) blockPrices.push(parsedValue);
    }

    if (!blockPrices.length) continue;
    candidates.push(Math.max(...blockPrices));
  }

  if (!candidates.length) return null;
  return Math.max(...candidates);
};

const extractRakutenItemUrl = (html = "", fallbackUrl = "") => {
  const patterns = [
    /https?:\/\/item\.rakuten\.co\.jp\/[a-z0-9._-]+\/[a-z0-9._~%/-]+\/?/gi,
    /href=["'](https?:\/\/item\.rakuten\.co\.jp\/[^"']+)["']/gi,
    /href=["'](\/[a-z0-9._-]+\/[a-z0-9._~%/-]+\/)["']/gi
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const candidate = match?.[1] || match?.[0] || "";
      if (!candidate) continue;
      try {
        const resolved = new URL(candidate, fallbackUrl || "https://item.rakuten.co.jp").toString();
        if (isRakutenProductUrl(resolved)) return resolved;
      } catch {
        continue;
      }
    }
  }

  return "";
};

const resolveRakutenSearchResult = async (result, timeoutMs = 2200) => {
  if (!isRakutenSearchUrl(result?.url)) return result;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(result.url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
      },
      signal: controller.signal
    });
    if (!response.ok) return null;

    const { html } = await decodeHtmlFromResponse(response, result.url);
    const itemUrl = extractRakutenItemUrl(html, response.url || result.url);
    if (!itemUrl) return null;

    return {
      ...result,
      url: itemUrl
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

const resolveSearchResultUrl = async (result) => {
  const url = String(result?.url || "").trim();
  if (!url) return null;
  if (isRakutenSearchUrl(url)) {
    return resolveRakutenSearchResult(result);
  }
  return result;
};

const withTimeout = async (promiseFactory, timeoutMs, fallbackValue) => {
  let timeoutId;
  try {
    return await Promise.race([
      promiseFactory(),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(fallbackValue), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
};

const getDeadlineMs = ({ mercariRequested, yahooRequested }) => {
  if (mercariRequested) return MERCARI_TOTAL_TIMEOUT_MS;
  if (yahooRequested) return YAHOO_TOTAL_TIMEOUT_MS;
  return BRAVE_TOTAL_TIMEOUT_MS;
};

const enrichMarketplaceResult = async (result, timeoutMs = ENRICH_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(result.productUrl, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
      },
      signal: controller.signal
    });
    if (!response.ok) return result;

    const { html, charset } = await decodeHtmlFromResponse(response, result.productUrl);
    const finalUrl = String(response.url || result.productUrl || "").trim();
    if (DELETED_ITEM_PATTERNS.some((pattern) => pattern.test(html))) return null;

    const domain = getSourceDomain(finalUrl);
    const auctionListing = detectAuctionListing({
      html,
      domain,
      title: result.title,
      productUrl: finalUrl
    });
    if (auctionListing.isAuction) {
      logAiSearchDebug("marketplace-auction-filter", {
        marketplace: domain || result.source || "unknown",
        productUrl: finalUrl,
        isAuction: true,
        reason: auctionListing.reason
      });
      return null;
    }

    if (isMercariDomain(finalUrl)) {
      const mercariAvailability = detectMercariSoldOut(html);
      logAiSearchDebug("marketplace-availability", {
        marketplace: "mercari",
        productUrl: finalUrl,
        soldOut: mercariAvailability.soldOut,
        reason: mercariAvailability.reason
      });
      if (mercariAvailability.soldOut) return null;
    }

    const productPageScore = getProductPageScore(finalUrl, domain.includes("amazon") ? "amazon" : domain.includes("rakuten") ? "rakuten" : "");
    const ogTitle = getMetaContent(html, "property", "og:title");
    const documentTitle = getDocumentTitle(html);
    const ogImage = getMetaContent(html, "property", "og:image");
    const jsonLdImage = getJsonLdImages(html, finalUrl)[0] || "";
    const domainImage =
      domain === "amazon.co.jp"
        ? getAmazonMainImage(html, finalUrl)
        : domain === "item.rakuten.co.jp"
          ? getRakutenMainImage(html, finalUrl)
          : "";
    const fallbackImage = getFirstLargeImage(html, finalUrl);
    const structuredPrice = getSafeMarketplacePrice(html);
    const domainVisiblePrice =
      structuredPrice == null
        ? domain === "amazon.co.jp"
          ? getAmazonVisiblePrice(html)
          : domain === "item.rakuten.co.jp"
            ? getRakutenVisiblePrice(html)
            : null
        : null;
    const allowVisiblePriceFallback = domain !== "amazon.co.jp" && domain !== "item.rakuten.co.jp";
    const genericVisiblePrice = structuredPrice == null && domainVisiblePrice == null && allowVisiblePriceFallback ? getVisibleMainPrice(html) : null;
    const priceJPY = structuredPrice ?? domainVisiblePrice ?? genericVisiblePrice ?? null;
    const priceConfidence = structuredPrice ? "structured" : domainVisiblePrice || genericVisiblePrice ? "visible" : "unknown";
    const imageCandidates = [
      { value: jsonLdImage, confidence: getImageConfidence(jsonLdImage, "jsonld") },
      { value: ogImage, confidence: getImageConfidence(ogImage, "og") },
      {
        value: domainImage,
        confidence: getImageConfidence(domainImage, domain === "amazon.co.jp" ? "amazon-main" : "rakuten-main")
      },
      { value: fallbackImage, confidence: getImageConfidence(fallbackImage, "selector") },
      { value: result.image, confidence: getImageConfidence(result.image, "brave-thumbnail") }
    ];
    const bestImageCandidate = imageCandidates.find((candidate) => candidate.value && candidate.confidence !== "low");
    const fallbackImageCandidate = imageCandidates.find((candidate) => candidate.value);
    const image = bestImageCandidate?.value || fallbackImageCandidate?.value || "";
    const imageConfidence = bestImageCandidate?.confidence || fallbackImageCandidate?.confidence || "unknown";
    const decodedTitleCandidates = [ogTitle, documentTitle, result.title].map(normalizeDecodedText).filter(Boolean);
    const title = decodedTitleCandidates.find((entry) => !isLikelyBrokenTitle(entry)) || result.title;
    const relevanceScore =
      domain === "item.rakuten.co.jp"
        ? getRakutenTitleRelevanceScore(title, result.searchKeyword || result.title || "")
        : Number(result.relevanceScore || 0);

    if (domain === "search.rakuten.co.jp" || productPageScore < MIN_PRODUCT_PAGE_SCORE) {
      return null;
    }

    logAiSearchDebug("result-enrichment", {
      domain,
      finalUrl,
      charset,
      productPageScore,
      imageFound: Boolean(image),
      imageConfidence,
      relevanceScore,
      priceJPY,
      priceConfidence,
      titleLooksBroken: isLikelyBrokenTitle(title)
    });

    return {
      ...result,
      productUrl: finalUrl,
      source: domain || result.source,
      title,
      image: imageConfidence === "low" ? "" : image,
      imageConfidence,
      priceJPY,
      priceConfidence,
      productPageScore,
      relevanceScore,
      sourceConfidence: getSourceConfidence(result.sourceConfidence)
    };
  } catch {
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
};

const enrichResults = async (results = [], remainingMs) => {
  const baseResults = finalizeResults(results);
  const mercariResults = baseResults.filter((result) => isMercariDomain(result?.productUrl || ""));
  const nonMercariResults = baseResults.filter((result) => !isMercariDomain(result?.productUrl || ""));
  const enrichable = [...mercariResults, ...nonMercariResults.slice(0, ENRICH_RESULT_LIMIT)];
  const untouched = nonMercariResults.slice(ENRICH_RESULT_LIMIT);
  const timeoutPerPage = Math.max(1200, Math.min(ENRICH_TIMEOUT_MS, remainingMs - 300));

  if (remainingMs <= 500 || enrichable.length === 0) return baseResults;

  const enriched = await Promise.all(
    enrichable.map((result) => withTimeout(() => enrichMarketplaceResult(result, timeoutPerPage), timeoutPerPage, result))
  );

  return finalizeResults([...enriched.filter(Boolean), ...untouched]);
};

const applyPriceFilter = (results = [], maxPriceJPY = null) => {
  if (!maxPriceJPY) return results;
  return results.filter((result) => result.priceJPY == null || Number(result.priceJPY) <= maxPriceJPY);
};

const searchWithBrave = async ({ query, preferredSources, strictMode = true, maxPriceJPY = null }) => {
  const apiKey = String(process.env.BRAVE_SEARCH_API_KEY || "").trim();
  if (!apiKey || !query || preferredSources.length === 0) return [];

  const allowedDomains = preferredSources.flatMap((sourceKey) => SOURCE_SEARCH_CONFIG[sourceKey]?.domains || []);
  const params = new URLSearchParams({
    q: query,
    count: String(BRAVE_FETCH_LIMIT),
    country: "JP",
    search_lang: "jp"
  });

  const response = await fetch(`${BRAVE_SEARCH_URL}?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey
    }
  });
  if (!response.ok) throw new Error(`Brave Search failed with status ${response.status}`);

  const payload = await response.json();
  const rawResults = Array.isArray(payload?.web?.results) ? payload.web.results : [];
  const resolvedResults = (
    await Promise.all(
      rawResults
        .filter((result) => isAllowedMarketplaceDomain(result?.url, allowedDomains))
        .map((result) => withTimeout(() => resolveSearchResultUrl(result), 2400, result))
    )
  ).filter(Boolean);

  return applyPriceFilter(
    resolvedResults
      .filter((result) =>
        strictMode
          ? matchesRequestedProductPage(result?.url, preferredSources)
          : !preferredSources.includes("rakuten") || isRakutenProductUrl(result?.url) || !isRakutenSearchUrl(result?.url)
      )
      .map((result) => mapBraveResultToProduct(result, query))
      .filter((result) => Number(result.productPageScore || 0) >= (strictMode ? MIN_PRODUCT_PAGE_SCORE : 40))
      .filter((result) => isStrictAllowedSourceResult(result?.productUrl, preferredSources))
      .filter((result) => result.title && result.productUrl),
    maxPriceJPY
  );
};

const runBraveStage = async ({ queries, preferredSources, strictMode, maxPriceJPY, remainingMs }) => {
  if (preferredSources.length === 0 || remainingMs <= 250) return [];

  const stageTasks = queries.map((query) =>
    withTimeout(() => searchWithBrave({ query, preferredSources, strictMode, maxPriceJPY }), Math.max(500, Math.min(remainingMs, 3000)), [])
  );
  const settled = await Promise.all(stageTasks);
  const bestResults = settled.reduce((best, results) => (results.length > best.length ? results : best), []);
  logProviderStage({
    provider: "scraper",
    keyword: dedupeStrings(queries).join(" | "),
    sourceConfidence: "needs_confirmation",
    resultCount: bestResults.length,
    status: "ok",
    detail: `sources=${preferredSources.join(",")}; strict=${strictMode}`
  });
  return bestResults;
};

const runOfficialProviderStage = async ({ queries, preferredSources, remainingMs }) => {
  if (!preferredSources.length || !queries.length || remainingMs <= 250) return [];

  const stageTasks = preferredSources.flatMap((sourceKey) =>
    dedupeStrings(queries)
      .slice(0, 3)
      .map((keyword) =>
        withTimeout(() => searchOfficialProvider({ sourceKey, keyword }), Math.max(800, Math.min(remainingMs, 3500)), [])
      )
  );

  const settled = await Promise.all(stageTasks);
  const mergedResults = finalizeResults(settled.flat());
  logProviderStage({
    provider: "official_provider_stage",
    keyword: dedupeStrings(queries).join(" | "),
    sourceConfidence: mergedResults.length ? "official" : "needs_confirmation",
    resultCount: mergedResults.length,
    status: "ok",
    detail: `sources=${preferredSources.join(",")}`
  });
  return mergedResults;
};

const runMercariStage = async ({ queries, maxPriceJPY, strictMode, clientKey, remainingMs }) => {
  if (remainingMs <= 250) return [];

  const mergedBucket = [];

  for (const query of dedupeStrings(queries).slice(0, 4)) {
    if (remainingMs <= 250) break;

    const response = await searchMercari(query, { maxPrice: maxPriceJPY, sort: "newest", clientKey });
    let results = Array.isArray(response?.results) ? response.results : [];
    const rawResultCount = results.length;
    if (strictMode) {
      results = results.filter((result) => String(result.productUrl || "").includes("/item/"));
    }
    const queryResults = applyPriceFilter(dedupeResults(results), maxPriceJPY);
    logAiSearchDebug("mercari-stage", {
      query,
      strictMode,
      maxPriceJPY,
      rawResultCount,
      finalResultCount: queryResults.length
    });

    mergedBucket.push(...queryResults);

    const mergedResults = dedupeResults(
      mergedBucket.sort((left, right) => {
        const scoreDelta = Number(right.relevanceScore || 0) - Number(left.relevanceScore || 0);
        if (scoreDelta !== 0) return scoreDelta;
        return Number(right.priceJPY || 0) - Number(left.priceJPY || 0);
      })
    );

    if (mergedResults.length >= STRICT_RESULT_MINIMUM) {
      logAiSearchDebug("mercari-stage-early-exit", {
        query,
        strictMode,
        mergedResultCount: mergedResults.length
      });
      return finalizeResults(mergedResults);
    }
  }

  const mergedResults = dedupeResults(
    mergedBucket.sort((left, right) => {
      const scoreDelta = Number(right.relevanceScore || 0) - Number(left.relevanceScore || 0);
      if (scoreDelta !== 0) return scoreDelta;
      return Number(right.priceJPY || 0) - Number(left.priceJPY || 0);
    })
  );

  logAiSearchDebug("mercari-stage-merged", {
    queries,
    strictMode,
    maxPriceJPY,
    mergedResultCount: mergedResults.length,
    topTitles: mergedResults.slice(0, 5).map((result) => result.title)
  });

  return finalizeResults(mergedResults);
};

const runYahooStage = async ({ queries, maxPriceJPY, remainingMs }) => {
  if (remainingMs <= 250) return [];

  const mergedBucket = [];

  for (const query of dedupeStrings(queries).slice(0, 4)) {
    if (remainingMs <= 250) break;

    const response = await searchYahoo(query, { maxPrice: maxPriceJPY, sort: "newest" });
    const queryResults = applyPriceFilter(dedupeResults(Array.isArray(response?.results) ? response.results : []), maxPriceJPY);

    logAiSearchDebug("yahoo-stage", {
      query,
      maxPriceJPY,
      finalResultCount: queryResults.length
    });

    mergedBucket.push(...queryResults);

    const mergedResults = dedupeResults(mergedBucket);
    if (mergedResults.length >= STRICT_RESULT_MINIMUM) {
      logAiSearchDebug("yahoo-stage-early-exit", {
        query,
        mergedResultCount: mergedResults.length
      });
      return finalizeResults(mergedResults);
    }
  }

  const mergedResults = dedupeResults(mergedBucket);

  logAiSearchDebug("yahoo-stage-merged", {
    queries,
    maxPriceJPY,
    mergedResultCount: mergedResults.length,
    topTitles: mergedResults.slice(0, 5).map((result) => result.title)
  });

  return finalizeResults(mergedResults);
};

const mergeSourceResults = (...resultGroups) => finalizeResults(resultGroups.flat());

const buildSummary = ({ filters, resultCount, usedBrave, usedRelaxedMode }) => {
  const budgetText = filters.maxPriceJPY ? ` under JPY ${filters.maxPriceJPY.toLocaleString("ja-JP")}` : "";
  const categoryText = filters.category ? ` in ${filters.category}` : "";

  if (!resultCount && filters.preferredSources?.length === 1 && filters.preferredSources[0] === "yahoo") {
    return YAHOO_NO_RESULTS_MESSAGE;
  }
  if (!resultCount && filters.preferredSources?.length === 1 && filters.preferredSources[0] === "mercari") {
    return MERCARI_NO_RESULTS_MESSAGE;
  }
  if (!resultCount) return NO_RESULTS_MESSAGE;
  if (usedRelaxedMode && resultCount < STRICT_RESULT_MINIMUM) return BROADER_RESULTS_MESSAGE;
  if (usedRelaxedMode) return "Showing broader results. Try a more specific search for direct items.";
  if (usedBrave) {
    return `I searched for "${filters.keyword}"${categoryText}${budgetText} and found ${resultCount} result${
      resultCount === 1 ? "" : "s"
    }. Review-required marketplaces still go through request review; instant checkout remains limited to eligible sources.`;
  }

  return `I searched for "${filters.keyword}"${categoryText}${budgetText} and found ${resultCount} result${
    resultCount === 1 ? "" : "s"
  }.`;
};

const buildNormalization = ({ filters, japaneseKeyword, preferredSources }) => ({
  searchKeywordJa: japaneseKeyword || filters.keyword,
  marketplaceLabel: preferredSources.length
    ? preferredSources.map((sourceKey) => SOURCE_DISPLAY_NAMES[sourceKey] || sourceKey).join(" / ")
    : "All supported marketplaces"
});

const clonePayload = (payload) => JSON.parse(JSON.stringify(payload));

export const aiShoppingSearch = asyncHandler(async (req, res) => {
  const originalMessage = String(req.body?.userMessage || "").trim();
  if (!originalMessage) {
    res.status(400);
    throw new Error("userMessage is required");
  }

  const parsedFilters = parseUserMessage(originalMessage);
  const rewrittenQuery = await rewriteSearchQuery(originalMessage, parsedFilters);
  const filters = {
    ...parsedFilters,
    keyword: rewrittenQuery.cleanKeywordEnglish || parsedFilters.keyword,
    maxPriceJPY: rewrittenQuery.maxPriceJPY ?? parsedFilters.maxPriceJPY,
    preferredSources:
      Array.isArray(rewrittenQuery.preferredSources) && rewrittenQuery.preferredSources.length
        ? rewrittenQuery.preferredSources
        : parsedFilters.preferredSources
  };
  const shouldBypassCache = filters.preferredSources.includes("mercari");
  const cacheKey = makeCacheKey(filters, originalMessage);
  const cached = shouldBypassCache ? null : readCache(cacheKey);
  if (cached) {
    logAiSearchDebug("cache-hit", {
      keyword: filters.keyword,
      selectedSources: filters.preferredSources,
      resultCount: Array.isArray(cached?.results) ? cached.results.length : 0,
      sourceConfidence: Array.isArray(cached?.results)
        ? [...new Set(cached.results.map((result) => getSourceConfidence(result?.sourceConfidence)))]
        : []
    });
    res.json(clonePayload(cached));
    return;
  }

  const legacyFallbackQueries = buildLegacyFallbackQueries(filters);
  const japaneseKeyword = dedupeStrings(rewrittenQuery.japaneseQueries || [])[0] || legacyFallbackQueries.japaneseKeyword;
  const normalization = buildNormalization({
    filters,
    japaneseKeyword,
    preferredSources: filters.preferredSources
  });
  const lowBudgetHint = shouldUseLowBudgetHint(filters.maxPriceJPY, filters.category);
  const aiJapaneseQueries = dedupeStrings(rewrittenQuery.japaneseQueries || []);
  const expandedJapaneseQueries = aiJapaneseQueries.length
    ? dedupeStrings(aiJapaneseQueries.flatMap((keyword) => (lowBudgetHint ? [keyword, `${keyword} 安い`] : [keyword])))
    : legacyFallbackQueries.expandedJapaneseQueries;
  const simpleJapaneseQueries = aiJapaneseQueries.length
    ? expandedJapaneseQueries
    : legacyFallbackQueries.simpleJapaneseQueries;
  const englishQueries = dedupeStrings([filters.keyword]);
  const broaderJapaneseQueries = dedupeStrings([
    ...(rewrittenQuery.broaderJapaneseQueries || []),
    ...buildBroaderKeywordVariants(japaneseKeyword || filters.keyword, filters.category).flatMap((keyword) => [
      `${keyword} 安い`,
      `${keyword} まとめ売り`,
      `${keyword} 中古`
    ])
  ]);
  const broaderEnglishQueries = buildBroaderKeywordVariants(filters.keyword, filters.category);
  const mercariRequested = filters.preferredSources.includes("mercari");
  const yahooRequested = filters.preferredSources.includes("yahoo");
  const braveSourceKeys = filters.preferredSources.filter((sourceKey) => sourceKey !== "mercari" && sourceKey !== "yahoo");
  const officialProviderSourceKeys = braveSourceKeys.filter((sourceKey) => sourceKey === "amazon" || sourceKey === "rakuten");
  const clientKey = req.user?._id?.toString() || req.ip || "anonymous";

  logAiSearchDebug("request", {
    rawUserMessage: originalMessage,
    cleanedKeyword: filters.keyword,
    japaneseKeyword,
    queryRewriteSource: "local_rules",
    cleanKeywordEnglish: rewrittenQuery.cleanKeywordEnglish,
    expandedJapaneseQueries,
    simpleJapaneseQueries,
    broaderJapaneseQueries,
    selectedSources: filters.preferredSources,
    maxPriceJPY: filters.maxPriceJPY,
    normalization
  });

  const expandedJapaneseStrictQueries = expandedJapaneseQueries.map((keyword) =>
    buildSearchQuery({ keyword, preferredSources: braveSourceKeys, strictMode: true })
  );
  const expandedJapaneseRelaxedQueries = expandedJapaneseQueries.map((keyword) =>
    buildSearchQuery({ keyword, preferredSources: braveSourceKeys, strictMode: false })
  );
  const japaneseStrictQueries = simpleJapaneseQueries.map((keyword) =>
    buildSearchQuery({ keyword, preferredSources: braveSourceKeys, strictMode: true })
  );
  const japaneseRelaxedQueries = simpleJapaneseQueries.map((keyword) =>
    buildSearchQuery({ keyword, preferredSources: braveSourceKeys, strictMode: false })
  );
  const englishStrictQueries = englishQueries.map((keyword) =>
    buildSearchQuery({ keyword, preferredSources: braveSourceKeys, strictMode: true })
  );
  const englishRelaxedQueries = englishQueries.map((keyword) =>
    buildSearchQuery({ keyword, preferredSources: braveSourceKeys, strictMode: false })
  );
  const broaderJapaneseStrictQueries = broaderJapaneseQueries.map((keyword) =>
    buildSearchQuery({ keyword, preferredSources: braveSourceKeys, strictMode: true })
  );
  const broaderJapaneseRelaxedQueries = broaderJapaneseQueries.map((keyword) =>
    buildSearchQuery({ keyword, preferredSources: braveSourceKeys, strictMode: false })
  );
  const broaderEnglishStrictQueries = broaderEnglishQueries.map((keyword) =>
    buildSearchQuery({ keyword, preferredSources: braveSourceKeys, strictMode: true })
  );
  const broaderEnglishRelaxedQueries = broaderEnglishQueries.map((keyword) =>
    buildSearchQuery({ keyword, preferredSources: braveSourceKeys, strictMode: false })
  );

  const deadline = Date.now() + getDeadlineMs({ mercariRequested, yahooRequested });
  const remainingMs = () => Math.max(0, deadline - Date.now());
  const braveRemainingMs = () => Math.max(0, Math.min(BRAVE_TOTAL_TIMEOUT_MS, deadline - Date.now()));

  let results = [];
  let usedBrave = false;
  let usedRelaxedMode = false;

  const maybePromoteResults = (candidateResults, options = {}) => {
    if (candidateResults.length > results.length) {
      results = finalizeResults(candidateResults);
      usedBrave = options.usedBrave ?? usedBrave;
      usedRelaxedMode = options.usedRelaxedMode ?? usedRelaxedMode;
    }
  };

  const runCombinedStage = async ({ mercariQueries, yahooQueries, providerQueries, braveQueries, strictMode, maxPriceJPY, relaxedFlag }) => {
    const [mercariResults, yahooResults, officialResults, braveResults] = await Promise.all([
      mercariRequested
        ? runMercariStage({ queries: mercariQueries, maxPriceJPY, strictMode, clientKey, remainingMs: remainingMs() })
        : Promise.resolve([]),
      yahooRequested
        ? runYahooStage({ queries: yahooQueries, maxPriceJPY, remainingMs: remainingMs() })
        : Promise.resolve([]),
      runOfficialProviderStage({
        queries: providerQueries,
        preferredSources: officialProviderSourceKeys,
        remainingMs: braveRemainingMs()
      }),
      runBraveStage({
        queries: braveQueries,
        preferredSources: braveSourceKeys,
        strictMode,
        maxPriceJPY,
        remainingMs: braveRemainingMs()
      })
    ]);

    return {
      merged: mergeSourceResults(mercariResults, yahooResults, officialResults, braveResults),
      usedBrave: braveResults.length > 0,
      usedRelaxedMode: relaxedFlag
    };
  };

  try {
    if (results.length < STRICT_RESULT_MINIMUM && remainingMs() > 250 && expandedJapaneseQueries.length > 0) {
      const stage = await runCombinedStage({
        mercariQueries: expandedJapaneseQueries,
        yahooQueries: expandedJapaneseQueries,
        providerQueries: expandedJapaneseQueries,
        braveQueries: expandedJapaneseStrictQueries,
        strictMode: true,
        maxPriceJPY: filters.maxPriceJPY,
        relaxedFlag: false
      });
      maybePromoteResults(stage.merged, stage);
    }

    if (results.length < STRICT_RESULT_MINIMUM && remainingMs() > 250) {
      const stage = await runCombinedStage({
        mercariQueries: simpleJapaneseQueries.length ? simpleJapaneseQueries : englishQueries,
        yahooQueries: simpleJapaneseQueries.length ? simpleJapaneseQueries : englishQueries,
        providerQueries: simpleJapaneseQueries.length ? simpleJapaneseQueries : englishQueries,
        braveQueries: japaneseStrictQueries,
        strictMode: true,
        maxPriceJPY: filters.maxPriceJPY,
        relaxedFlag: false
      });
      maybePromoteResults(stage.merged, stage);
    }

    if (results.length < STRICT_RESULT_MINIMUM && remainingMs() > 250 && expandedJapaneseQueries.length > 0) {
      const stage = await runCombinedStage({
        mercariQueries: expandedJapaneseQueries,
        yahooQueries: expandedJapaneseQueries,
        providerQueries: expandedJapaneseQueries,
        braveQueries: expandedJapaneseRelaxedQueries,
        strictMode: false,
        maxPriceJPY: filters.maxPriceJPY,
        relaxedFlag: true
      });
      maybePromoteResults(stage.merged, stage);
    }

    if (results.length < STRICT_RESULT_MINIMUM && remainingMs() > 250) {
      const stage = await runCombinedStage({
        mercariQueries: simpleJapaneseQueries.length ? simpleJapaneseQueries : englishQueries,
        yahooQueries: simpleJapaneseQueries.length ? simpleJapaneseQueries : englishQueries,
        providerQueries: simpleJapaneseQueries.length ? simpleJapaneseQueries : englishQueries,
        braveQueries: japaneseRelaxedQueries,
        strictMode: false,
        maxPriceJPY: filters.maxPriceJPY,
        relaxedFlag: true
      });
      maybePromoteResults(stage.merged, stage);
    }

    if (results.length < STRICT_RESULT_MINIMUM && remainingMs() > 250) {
      const stage = await runCombinedStage({
        mercariQueries: englishQueries,
        yahooQueries: englishQueries,
        providerQueries: englishQueries,
        braveQueries: englishStrictQueries,
        strictMode: true,
        maxPriceJPY: filters.maxPriceJPY,
        relaxedFlag: false
      });
      maybePromoteResults(stage.merged, stage);
    }

    if (results.length < STRICT_RESULT_MINIMUM && remainingMs() > 250) {
      const stage = await runCombinedStage({
        mercariQueries: englishQueries,
        yahooQueries: englishQueries,
        providerQueries: englishQueries,
        braveQueries: englishRelaxedQueries,
        strictMode: false,
        maxPriceJPY: filters.maxPriceJPY,
        relaxedFlag: true
      });
      maybePromoteResults(stage.merged, stage);
    }

    if (results.length < STRICT_RESULT_MINIMUM && remainingMs() > 250) {
      const stage = await runCombinedStage({
        mercariQueries: broaderJapaneseQueries,
        yahooQueries: broaderJapaneseQueries,
        providerQueries: broaderJapaneseQueries,
        braveQueries: broaderJapaneseRelaxedQueries.length ? broaderJapaneseRelaxedQueries : broaderJapaneseStrictQueries,
        strictMode: false,
        maxPriceJPY: null,
        relaxedFlag: true
      });
      maybePromoteResults(stage.merged, stage);
    }

    if (results.length < STRICT_RESULT_MINIMUM && remainingMs() > 250) {
      const stage = await runCombinedStage({
        mercariQueries: broaderEnglishQueries,
        yahooQueries: broaderEnglishQueries,
        providerQueries: broaderEnglishQueries,
        braveQueries: broaderEnglishRelaxedQueries.length ? broaderEnglishRelaxedQueries : broaderEnglishStrictQueries,
        strictMode: false,
        maxPriceJPY: null,
        relaxedFlag: true
      });
      maybePromoteResults(stage.merged, stage);
    }
  } catch {
    results = finalizeResults(results);
  }

  const enrichedResults = applyPriceFilter(await enrichResults(results, remainingMs()), filters.maxPriceJPY);
  const sourceConfidenceSet = [...new Set(enrichedResults.map((result) => getSourceConfidence(result?.sourceConfidence)))];

  if (!enrichedResults.length) {
    logProviderStage({
      provider: "fallback",
      keyword: filters.keyword,
      sourceConfidence: "needs_confirmation",
      resultCount: 0,
      status: "empty",
      detail: `sources=${filters.preferredSources.join(",")}`
    });
  } else {
    logAiSearchDebug("provider-result-summary", {
      providersPresent: [...new Set(enrichedResults.map((result) => String(result.sourceConfidence || "needs_confirmation")))],
      sourceConfidence: sourceConfidenceSet,
      resultCount: enrichedResults.length
    });
  }

  const payload = {
    filters,
    normalization,
    summary: buildSummary({
      filters,
      resultCount: enrichedResults.length,
      usedBrave,
      usedRelaxedMode
    }),
    results: enrichedResults,
    safety: {
      autoPurchase: false,
      bypassesCheckoutRules: false,
      reviewRequiredSources: ["Mercari", "Yahoo Shopping", "Rakuma"],
      directCheckoutSources: ["Amazon Japan", "Rakuten"]
    }
  };

  if (!shouldBypassCache) {
    writeCache(cacheKey, payload);
  }
  res.json(payload);
});
