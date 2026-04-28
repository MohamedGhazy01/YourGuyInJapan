const YAHOO_SHOPPING_SEARCH_URL = "https://shopping.yahoo.co.jp/search";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const SCRAPE_TIMEOUT_MS = 30000;
const SELECTOR_SETTLE_MS = 4000;
const MAX_RESULTS = 10;
const MAX_SCRAPE_RESULTS = 12;
const AUCTION_BLOCK_PATTERNS = [/\bauction\b/i, /\bbid(?:ding)?\b/i, /オークション/i, /入札/i];

let playwrightBrowserPromise = null;

const yahooSearchCache = new Map();
const yahooInFlightSearches = new Map();

const logYahooDebug = (label, payload) => {
  try {
    console.info(`[yahoo-search] ${label}`, payload);
  } catch {
    // Ignore logging failures.
  }
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
  const url = String(result?.productUrl || "").trim();
  const title = String(result?.title || "").trim();
  const source = String(result?.source || "").trim();
  const combinedText = `${title} ${source}`;

  if (/auctions\.yahoo\.co\.jp/i.test(url)) return true;
  if (/\/auction\//i.test(url)) return true;

  return AUCTION_BLOCK_PATTERNS.some((pattern) => pattern.test(url) || pattern.test(combinedText));
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

const applyFilters = (results, { minPrice = 0, maxPrice = null, sort = "newest", limit = MAX_RESULTS } = {}) =>
  sortResults(
    results.filter((result) => {
      const priceJPY = Number(result.priceJPY || 0);
      if (Number.isFinite(minPrice) && minPrice > 0 && priceJPY > 0 && priceJPY < minPrice) return false;
      if (maxPrice !== null && Number.isFinite(maxPrice) && maxPrice > 0 && priceJPY > 0 && priceJPY > maxPrice) return false;
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
  const cached = yahooSearchCache.get(normalizeQuery(query));
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    yahooSearchCache.delete(normalizeQuery(query));
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
  yahooSearchCache.set(normalizeQuery(query), {
    results,
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS
  });
};

const parsePriceJPY = (value = "") => {
  const match = String(value || "").match(/(?:現在\s*|即決\s*)?([\d,]{3,})円/);
  if (!match) return null;

  const parsed = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeYahooUrl = (href = "") => {
  if (!href) return "";

  try {
    const url = new URL(href);

    if (url.hostname === "shopping-item-reach.yahoo.co.jp") {
      const rdUrl = url.searchParams.get("rdUrl");
      if (rdUrl) {
        return new URL(rdUrl).toString();
      }
    }

    return url.toString();
  } catch {
    return "";
  }
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

const scrapeYahooShoppingResults = async (page, query, options) => {
  const searchUrl = `${YAHOO_SHOPPING_SEARCH_URL}?p=${encodeURIComponent(query)}`;
  await page.goto(searchUrl, {
    waitUntil: "domcontentloaded",
    timeout: SCRAPE_TIMEOUT_MS
  }).catch(() => {});

  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForTimeout(SELECTOR_SETTLE_MS);
  await page.waitForSelector('a[href*="shopping.yahoo.co.jp/products/"], a.SearchResult_SearchResultItem__detailLink__G4Top', {
    state: "attached",
    timeout: 1500
  }).catch(() => {});

  const rawResults = await page
    .locator('a.SearchResult_SearchResultItem__detailLink__G4Top')
    .evaluateAll((anchors, itemLimit) => {
      const results = [];

      for (const anchor of anchors) {
        const card = anchor.closest("li") || anchor.parentElement;
        const rawHref = anchor.href || anchor.getAttribute("href") || "";
        const productHref = card?.querySelector('a[href*="shopping.yahoo.co.jp/products/"]')?.href || "";
        const imageEl = card?.querySelector("img");
        const text = (card?.textContent || "").replace(/\s+/g, " ").trim();

        results.push({
          title: (anchor.textContent || "").trim(),
          rawHref,
          productHref,
          image: imageEl?.getAttribute("src") || imageEl?.getAttribute("data-src") || "",
          text
        });

        if (results.length >= itemLimit * 3) break;
      }

      return results;
    }, options.limit);

  const mappedResults = dedupeResults(
    rawResults
      .map((result) => {
        const normalizedDetailUrl = normalizeYahooUrl(result.rawHref);
        const normalizedProductUrl = normalizeYahooUrl(result.productHref);
        const productUrl = normalizedProductUrl || normalizedDetailUrl;
        return {
          title: result.title || query,
          image: result.image || "",
          priceJPY: parsePriceJPY(result.text),
          source: "Yahoo Shopping",
          productUrl
        };
      })
      .filter((result) => {
        if (!result.productUrl) return false;
        if (!(result.productUrl.includes("shopping.yahoo.co.jp/") || result.productUrl.includes("store.shopping.yahoo.co.jp/"))) {
          return false;
        }
        return !isAuctionLikeResult(result);
      })
  );

  const finalResults = applyFilters(mappedResults, {
    ...options,
    sort: "newest",
    limit: MAX_SCRAPE_RESULTS
  });

  logYahooDebug("shopping-scrape-results", {
    query,
    searchUrl,
    rawResultCount: rawResults.length,
    mappedResultCount: mappedResults.length,
    filteredResultCount: finalResults.length,
    topUrls: finalResults.slice(0, 3).map((result) => result.productUrl)
  });

  return finalResults;
};

const scrapeYahooResults = async (query, options) => {
  const browser = await getSharedBrowser();
  const shoppingPage = await browser.newPage({
    locale: "ja-JP",
    userAgent: DEFAULT_USER_AGENT
  });

  try {
    const shoppingResults = await scrapeYahooShoppingResults(shoppingPage, query, options).catch(() => []);

    const mergedResults = applyFilters(
      dedupeResults(shoppingResults),
      {
        ...options,
        sort: "newest",
        limit: MAX_SCRAPE_RESULTS
      }
    );

    logYahooDebug("scrape-complete", {
      query,
      shoppingResultCount: shoppingResults.length,
      mergedResultCount: mergedResults.length
    });

    if (!mergedResults.length) {
      throw new Error("Yahoo search returned no visible shopping results");
    }

    return mergedResults;
  } finally {
    await shoppingPage.close().catch(() => {});
  }
};

export const searchYahoo = async (query, options = {}) => {
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
  const inFlightSearch = yahooInFlightSearches.get(queryKey);
  if (inFlightSearch) {
    const inFlightResults = await inFlightSearch;
    return {
      results: applyFilters(inFlightResults, normalizedOptions),
      cached: false,
      fallback: false,
      warning: ""
    };
  }

  const scrapePromise = scrapeYahooResults(keyword, normalizedOptions);
  yahooInFlightSearches.set(queryKey, scrapePromise);

  try {
    const rawResults = await scrapePromise;
    writeCache(keyword, rawResults);
    const filteredResults = applyFilters(rawResults, normalizedOptions);

    logYahooDebug("search-complete", {
      query: keyword,
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
    logYahooDebug("search-failed", {
      query: keyword,
      maxPrice: normalizedOptions.maxPrice,
      error: error?.message || "unknown error"
    });

    return {
      results: [],
      cached: false,
      fallback: false,
      warning: "Yahoo search is temporarily unavailable."
    };
  } finally {
    yahooInFlightSearches.delete(queryKey);
  }
};
