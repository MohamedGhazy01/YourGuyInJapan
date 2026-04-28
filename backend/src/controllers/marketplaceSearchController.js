import asyncHandler from "express-async-handler";
import { searchMercari } from "../utils/mercariSearch.js";

const SOURCE_CONFIG = {
  mercari: {
    source: "Mercari"
  },
  amazon: {
    source: "Amazon Japan"
  },
  rakuten: {
    source: "Rakuten"
  },
  rakuma: {
    source: "Rakuma"
  },
  yahoo: {
    source: "Yahoo Shopping"
  }
};

const AUCTION_BLOCK_PATTERNS = [/\bauction\b/i, /\bbid(?:ding)?\b/i, /オークション/i, /入札/i];

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

  return sorted.sort((left, right) => new Date(right.listedAt) - new Date(left.listedAt));
};

export const marketplaceSourceKeys = Object.keys(SOURCE_CONFIG);

export const performMarketplaceSearch = async ({
  query = "",
  sourceKeys = [],
  minPrice = 0,
  maxPrice = null,
  sort = "newest",
  clientKey = "anonymous"
} = {}) => {
  const normalizedQuery = String(query || "").trim();

  if (!normalizedQuery) {
    return [];
  }

  const selectedSourceKeys = sourceKeys
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter((entry) => SOURCE_CONFIG[entry]);
  const minPriceValue = Number(minPrice || 0);
  const maxPriceValue = Number(maxPrice || 0) > 0 ? Number(maxPrice) : null;
  const includeMercari = selectedSourceKeys.length === 0 || selectedSourceKeys.includes("mercari");

  let mercariResults = [];

  if (includeMercari) {
    const mercariResponse = await searchMercari(normalizedQuery, {
      minPrice: minPriceValue,
      maxPrice: maxPriceValue,
      sort,
      clientKey
    });
    mercariResults = mercariResponse.results;
  }

  return sortResults(
    mercariResults.filter((result) => {
      if (isAuctionLikeResult(result)) return false;
      const priceJPY = Number(result.priceJPY || 0);
      if (Number.isFinite(minPriceValue) && minPriceValue > 0 && priceJPY < minPriceValue) return false;
      if (maxPriceValue !== null && priceJPY > maxPriceValue) return false;
      return true;
    }),
    sort
  ).map(({ listedAt, ...result }) => result);
};

export const searchMarketplaceProducts = asyncHandler(async (req, res) => {
  const query = String(req.query?.q || "").trim();
  const source = String(req.query?.source || "").trim().toLowerCase();
  const minPrice = Number(req.query?.minPrice || 0);
  const maxPriceRaw = Number(req.query?.maxPrice || 0);
  const sort = String(req.query?.sort || "newest").trim();
  const sourceKeys = source
    ? source
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    : [];

  if (!query) {
    res.json([]);
    return;
  }

  const clientKey = req.user?._id?.toString() || req.ip || "anonymous";
  const results = await performMarketplaceSearch({
    query,
    sourceKeys,
    minPrice,
    maxPrice: maxPriceRaw,
    sort,
    clientKey
  });

  res.json(results);
});

export const searchMercariProducts = asyncHandler(async (req, res) => {
  const query = String(req.query?.q || "").trim();
  const minPrice = Number(req.query?.minPrice || 0);
  const maxPriceRaw = Number(req.query?.maxPrice || 0);
  const sort = String(req.query?.sort || "newest").trim();
  const maxPrice = maxPriceRaw > 0 ? maxPriceRaw : null;

  if (!query) {
    res.json({ results: [], warning: "", cached: false, fallback: false });
    return;
  }

  const clientKey = req.user?._id?.toString() || req.ip || "anonymous";
  const response = await searchMercari(query, {
    minPrice,
    maxPrice,
    sort,
    clientKey
  });

  res.json(response);
});
