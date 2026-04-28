const MERCARI_BASE_URL = "https://jp.mercari.com";
const MERCARI_SEARCH_URL = `${MERCARI_BASE_URL}/search`;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const SCRAPE_TIMEOUT_MS = 30000;
const SELECTOR_SETTLE_MS = 5000;
const MAX_RESULTS = 10;
const MAX_SCRAPE_RESULTS = 12;
const TRACK_SELECTOR = 'a[data-testid="thumbnail-link"]';
const RESULT_LOCATION = "search_result:best_match:body:item_list:item_thumbnail";

let playwrightBrowserPromise = null;

const mercariSearchCache = new Map();
const mercariInFlightSearches = new Map();

const logMercariDebug = (label, payload) => {
  try {
    console.info(`[mercari-search] ${label}`, payload);
  } catch {
    // Ignore logging failures.
  }
};

const sortResults = (results, sort = "newest") => {
  const sorted = [...results];

  if (sort === "priceAsc") {
    return sorted.sort((left, right) => Number(left.priceJPY || 0) - Number(right.priceJPY || 0));
  }

  if (sort === "priceDesc") {
    return sorted.sort((left, right) => Number(right.priceJPY || 0) - Number(left.priceJPY || 0));
  }

  return sorted;
};

const normalizeMercariUrl = (href = "") => {
  if (!href) return "";

  try {
    return new URL(href, MERCARI_BASE_URL).toString();
  } catch {
    return "";
  }
};

const parsePriceJPY = (value = "") => {
  const match = String(value || "").match(/[¥\u00A5]\s*([\d,]+)/);
  if (!match) return null;

  const parsed = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeSearchTokens = (query = "") =>
  String(query || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

const dedupeResults = (results = []) => {
  const seen = new Set();
  return results.filter((result) => {
    const key = String(result?.productUrl || "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const normalizeMercariText = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const scoreMercariRelevance = (title = "", query = "") => {
  const normalizedTitle = normalizeMercariText(title);
  const normalizedQuery = normalizeMercariText(query);
  const tokens = normalizeSearchTokens(normalizedQuery);

  if (!normalizedTitle || !tokens.length) return 0;
  if (normalizedTitle.includes(normalizedQuery)) return 1;

  const matchedTokens = tokens.filter((token) => token.length > 1 && normalizedTitle.includes(token));
  if (!matchedTokens.length) return 0;

  const tokenCoverage = matchedTokens.length / tokens.length;
  const titleCompact = normalizedTitle.replace(/\s+/g, "");
  const queryCompact = normalizedQuery.replace(/\s+/g, "");
  const compactBoost = titleCompact.includes(queryCompact) ? 0.2 : 0;

  return Math.min(1, tokenCoverage + compactBoost);
};

const isRelevantMercariResult = (title = "", query = "") => {
  const tokens = normalizeSearchTokens(query);
  const score = scoreMercariRelevance(title, query);

  if (tokens.length <= 1) {
    return score >= 0.3;
  }

  return score >= 0.25;
};

const applyFilters = (results, { minPrice = 0, maxPrice = null, sort = "newest", limit = MAX_RESULTS } = {}) =>
  sortResults(
    results.filter((result) => {
      const priceJPY = Number(result.priceJPY || 0);
      if (Number.isFinite(minPrice) && minPrice > 0 && priceJPY < minPrice) return false;
      if (maxPrice !== null && Number.isFinite(maxPrice) && maxPrice > 0 && priceJPY > maxPrice) return false;
      return true;
    }),
    sort
  ).slice(0, limit);

const normalizeSearchOptions = ({ minPrice = 0, maxPrice = null, sort = "newest", limit = MAX_RESULTS } = {}) => {
  const parsedMinPrice = Number(minPrice || 0);
  const parsedMaxPrice = Number(maxPrice || 0);
  const parsedLimit = Number(limit || MAX_RESULTS);

  return {
    minPrice: Number.isFinite(parsedMinPrice) && parsedMinPrice > 0 ? Math.round(parsedMinPrice) : 0,
    maxPrice: Number.isFinite(parsedMaxPrice) && parsedMaxPrice > 0 ? Math.round(parsedMaxPrice) : null,
    sort: ["priceAsc", "priceDesc", "newest"].includes(sort) ? sort : "newest",
    limit: Math.max(1, Math.min(Number.isFinite(parsedLimit) ? parsedLimit : MAX_RESULTS, MAX_SCRAPE_RESULTS))
  };
};

const normalizeQuery = (query = "") => String(query || "").trim().toLowerCase();

const readCache = (query, options) => {
  const cached = mercariSearchCache.get(normalizeQuery(query));
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    mercariSearchCache.delete(normalizeQuery(query));
    return null;
  }

  return {
    results: applyFilters(cached.results, options),
    cached: true,
    fallback: false,
    warning: ""
  };
};

const writeCache = (query, results) => {
  mercariSearchCache.set(normalizeQuery(query), {
    results,
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS
  });
};

const getSharedBrowser = async () => {
  if (!playwrightBrowserPromise) {
    playwrightBrowserPromise = import("playwright")
      .then(({ chromium }) =>
        chromium.launch({
          headless: true
        })
      )
      .then((browser) => {
        browser.on("disconnected", () => {
          playwrightBrowserPromise = null;
        });
        return browser;
      })
      .catch((error) => {
        playwrightBrowserPromise = null;
        throw error;
      });
  }

  return playwrightBrowserPromise;
};

const readMercariResultsFromPage = async (page, limit) =>
  page.locator(TRACK_SELECTOR).evaluateAll((anchors, itemLimit) =>
    anchors
      .filter((anchor) => (anchor.getAttribute("href") || "").startsWith("/item/"))
      .slice(0, itemLimit)
      .map((anchor) => ({
        title: anchor.querySelector('[data-testid="thumbnail-item-name"]')?.textContent?.trim() || "",
        image:
          anchor.querySelector("img")?.getAttribute("src") ||
          anchor.querySelector("img")?.getAttribute("data-src") ||
          "",
        priceText: anchor.textContent?.trim() || "",
        href: anchor.getAttribute("href") || ""
      })),
    limit
  );

const scrapeMercariResults = async (query, options) => {
  const browser = await getSharedBrowser();
  const searchUrl = `${MERCARI_SEARCH_URL}?keyword=${encodeURIComponent(query)}`;
  
  const page = await browser.newPage({
    locale: "ja-JP",
    userAgent: DEFAULT_USER_AGENT
  });

  try {
    await page.goto(searchUrl, {
      waitUntil: "networkidle",
      timeout: SCRAPE_TIMEOUT_MS
    }).catch(() => {});

    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(SELECTOR_SETTLE_MS);
    await page.waitForSelector(TRACK_SELECTOR, {
      state: "attached",
      timeout: 1000
    }).catch(() => {});

    const selectorCount = await page.locator(TRACK_SELECTOR).count();
    if (!selectorCount) {
      throw new Error("Mercari search returned no visible results");
    }

    const rawResults = await readMercariResultsFromPage(page, options.limit);
    const mappedResults = rawResults
      .map((result) => ({
        title: result.title,
        image: result.image,
        priceJPY: parsePriceJPY(result.priceText),
        source: "Mercari",
        productUrl: normalizeMercariUrl(result.href),
        relevanceScore: scoreMercariRelevance(result.title, query)
      }))
      .filter((result) => result.title && result.image && result.priceJPY && result.productUrl);
    const relevantResults = mappedResults.filter((result) => isRelevantMercariResult(result.title, query));
    const fallbackRawResults = [...mappedResults].sort(
      (left, right) => Number(right.relevanceScore || 0) - Number(left.relevanceScore || 0)
    );
    const selectedResults =
      relevantResults.length >= 5
        ? relevantResults
        : dedupeResults([...relevantResults, ...fallbackRawResults]).slice(0, MAX_SCRAPE_RESULTS);
    const finalResults = applyFilters(selectedResults, {
      ...options,
      sort: "newest",
      limit: MAX_SCRAPE_RESULTS
    });

    logMercariDebug("scrape-results", {
      query,
      searchUrl,
      rawResultCount: rawResults.length,
      mappedResultCount: mappedResults.length,
      relevantResultCount: relevantResults.length,
      fallbackRawResultCount: fallbackRawResults.length,
      selectedResultCount: selectedResults.length,
      filteredResultCount: finalResults.length,
      maxPrice: options.maxPrice ?? null,
      topTitles: finalResults.slice(0, 3).map((result) => result.title)
    });

    if (!mappedResults.length) {
      throw new Error("Mercari search returned no visible results");
    }

    return finalResults;
  } finally {
    await page.close().catch(() => {});
  }
};

const getFallbackResponse = (query, options, warning) => {
  const cachedEntry = readCache(query, options);
  if (cachedEntry) {
    return {
      ...cachedEntry,
      warning,
      fallback: true
    };
  }

  return {
    results: [],
    cached: false,
    fallback: false,
    warning
  };
};

export const searchMercari = async (query, options = {}) => {
  const keyword = String(query || "").trim();
  if (!keyword) {
    return {
      results: [],
      cached: false,
      fallback: false,
      warning: ""
    };
  }

  const normalizedOptions = normalizeSearchOptions(options);
  const cachedEntry = readCache(keyword, normalizedOptions);
  if (cachedEntry) {
    return cachedEntry;
  }

  const queryKey = normalizeQuery(keyword);
  const inFlightSearch = mercariInFlightSearches.get(queryKey);
  if (inFlightSearch) {
    const inFlightResults = await inFlightSearch;
    return {
      results: applyFilters(inFlightResults, normalizedOptions),
      cached: false,
      fallback: false,
      warning: ""
    };
  }

  const scrapePromise = scrapeMercariResults(keyword, normalizedOptions);
  mercariInFlightSearches.set(queryKey, scrapePromise);

  try {
    const rawResults = await scrapePromise;
    writeCache(keyword, rawResults);
    const filteredResults = applyFilters(rawResults, normalizedOptions);

    logMercariDebug("search-complete", {
      query: keyword,
      searchUrl: `${MERCARI_SEARCH_URL}?keyword=${encodeURIComponent(keyword)}`,
      rawResultCount: rawResults.length,
      filteredResultCount: filteredResults.length,
      maxPrice: normalizedOptions.maxPrice
    });

    return {
      results: filteredResults,
      cached: false,
      fallback: false,
      warning: ""
    };
  } catch (error) {
    logMercariDebug("search-failed", {
      query: keyword,
      searchUrl: `${MERCARI_SEARCH_URL}?keyword=${encodeURIComponent(keyword)}`,
      maxPrice: normalizedOptions.maxPrice,
      error: error?.message || "unknown error"
    });
    return getFallbackResponse(
      keyword,
      normalizedOptions,
      "Mercari search is temporarily unavailable."
    );
  } finally {
    mercariInFlightSearches.delete(queryKey);
  }
};
