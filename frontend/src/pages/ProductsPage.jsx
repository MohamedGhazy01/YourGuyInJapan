import { AnimatePresence, motion } from "framer-motion";
import { Bot, Search, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { AIThinkingWidget } from "../components/ui/AIThinkingWidget";
import { MarketplaceSearchCard } from "../components/ui/MarketplaceSearchCard";
import { ProductCard } from "../components/ui/ProductCard";
import { LoadingGrid } from "../components/ui/LoadingGrid";
import { useApp } from "../context/AppProvider";
import api from "../services/api";

const aiSourceChips = [
  { value: "mercari", label: "Mercari" },
  { value: "amazon", label: "Amazon" },
  { value: "rakuten", label: "Rakuten" },
  { value: "rakuma", label: "Rakuma" },
  { value: "yahoo", label: "Yahoo" }
];

const aiSourceDisplayNames = {
  mercari: "メルカリ",
  amazon: "Amazon Japan",
  rakuten: "楽天",
  rakuma: "ラクマ",
  yahoo: "Yahoo"
};

export const ProductsPage = () => {
  const navigate = useNavigate();
  const aiSearchRef = useRef(null);
  const assistantSearchControllerRef = useRef(null);
  const { auth, currency, setNotice } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ search: "", category: "all", sort: "featured" });
  const [assistantMessage, setAssistantMessage] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const [assistantResponse, setAssistantResponse] = useState(null);
  const [assistantRequestBusy, setAssistantRequestBusy] = useState(false);
  const [assistantNormalizationPreview, setAssistantNormalizationPreview] = useState(null);
  const [assistantLoadingText, setAssistantLoadingText] = useState("Searching Japanese marketplaces...");
  const [assistantSearchSnapshot, setAssistantSearchSnapshot] = useState(null);
  const assistantResultsAreWeak =
    assistantResponse?.results?.length > 0 && assistantResponse.results.length < 3;
  const assistantSelectedSources = aiSourceChips
    .filter((source) => new RegExp(`\\b${source.value}\\b`, "i").test(assistantMessage))
    .map((source) => source.value);

  useEffect(() => {
    setLoading(true);
    setError("");
    api
      .get("/products", { params: { ...filters, currency } })
      .then((response) => {
        setProducts(response.data.products);
        setCategories(response.data.categories);
      })
      .catch(() => {
        setProducts([]);
        setError("Could not load products. Check that the backend is running.");
      })
      .finally(() => setLoading(false));
  }, [filters, currency]);

  useEffect(() => {
    if (window.location.hash !== "#ai-search") return;

    const timeoutId = window.setTimeout(() => {
      aiSearchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!assistantLoading) {
      setAssistantLoadingText("Searching Japanese marketplaces...");
      return undefined;
    }

    setAssistantLoadingText("Searching Japanese marketplaces...");
    const timeoutId = window.setTimeout(() => {
      setAssistantLoadingText("Checking prices, photos, and availability...");
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [assistantLoading]);

  const handleAssistantSearch = async (event) => {
    event.preventDefault();
    const userMessage = assistantMessage.trim();

    if (!userMessage || assistantLoading) return;

    assistantSearchControllerRef.current?.abort();
    const controller = new AbortController();
    assistantSearchControllerRef.current = controller;
    const searchSnapshot = {
      userMessage,
      selectedSources: [...assistantSelectedSources]
    };

    setAssistantLoading(true);
    setAssistantError("");
    setAssistantResponse(null);
    setAssistantSearchSnapshot(searchSnapshot);
    setAssistantNormalizationPreview({
      searchKeywordJa: "Preparing Japanese marketplace search...",
      marketplaceLabel:
        searchSnapshot.selectedSources.length > 0
          ? searchSnapshot.selectedSources.map((sourceValue) => aiSourceDisplayNames[sourceValue] || sourceValue).join(" / ")
          : "All supported marketplaces"
    });

    try {
      const response = await api.post("/ai-shopping-search", { userMessage }, { signal: controller.signal });
      setAssistantResponse(response.data);
      setAssistantNormalizationPreview(response.data?.normalization || null);
    } catch (error) {
      if (error?.code === "ERR_CANCELED") {
        setAssistantResponse(null);
        setAssistantError("Search canceled.");
        setAssistantNormalizationPreview(null);
        return;
      }
      setAssistantResponse(null);
      setAssistantError(error.response?.data?.message || "The shopping assistant could not search right now.");
      setAssistantNormalizationPreview(null);
    } finally {
      if (assistantSearchControllerRef.current === controller) {
        assistantSearchControllerRef.current = null;
      }
      setAssistantLoading(false);
    }
  };

  const handleAssistantCancelSearch = () => {
    if (!assistantLoading) return;
    assistantSearchControllerRef.current?.abort();
    assistantSearchControllerRef.current = null;
  };

  const handleAssistantClear = () => {
    if (assistantLoading) return;
    setAssistantMessage("");
    setAssistantError("");
    setAssistantResponse(null);
    setAssistantSearchSnapshot(null);
    setAssistantNormalizationPreview(null);
  };

  const handleAssistantSourceChip = (sourceValue) => {
    if (assistantLoading || assistantSelectedSources.includes(sourceValue)) return;

    setAssistantMessage((current) => {
      const trimmed = current.trim();

      if (!trimmed) {
        return `on ${sourceValue}`;
      }

      return `${trimmed}${assistantSelectedSources.length > 0 ? " and " : " on "}${sourceValue}`;
    });
  };

  const handleAssistantRequest = async () => {
    if (assistantRequestBusy || !assistantResponse?.filters?.keyword) return;

    if (!auth?.token) {
      setNotice("Please sign in to send a sourcing request.");
      navigate("/auth");
      return;
    }

    setAssistantRequestBusy(true);

    try {
      const budget = assistantResponse.filters?.maxPriceJPY || null;
      const preferredSources = assistantResponse.filters?.preferredSources?.length
        ? assistantResponse.filters.preferredSources.join(", ")
        : "Any supported marketplace";
      const category = assistantResponse.filters?.category ? `Category: ${assistantResponse.filters.category}.` : "";
      const response = await api.post("/proxy-requests", {
        title: assistantResponse.filters.keyword,
        budget,
        condition: "",
        notes: `${category} Preferred sources: ${preferredSources}.`,
        originalUserMessage: assistantSearchSnapshot?.userMessage || assistantMessage.trim()
      });

      setNotice(
        response.data?.existing
          ? "You already have an active sourcing request for this item."
          : "Sourcing request created. Our team will review options for you."
      );
      navigate("/request");
    } catch (error) {
      setNotice(error.response?.data?.message || "Could not create a sourcing request.");
    } finally {
      setAssistantRequestBusy(false);
    }
  };

  return (
    <section className="container-shell py-12">
      <Helmet>
        <title>Products | YourGuyInJapan.com</title>
      </Helmet>

      <div
        id="ai-search"
        ref={aiSearchRef}
        className="glass mb-10 overflow-hidden rounded-[34px] border p-6 md:p-8"
        style={{
          background:
            "radial-gradient(circle at top left, rgba(223, 236, 231, 0.54), transparent 26%), linear-gradient(180deg, rgba(255,255,255,0.82), rgba(255,248,244,0.94))",
          borderColor: "color-mix(in srgb, var(--line) 145%, transparent)"
        }}
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div>
            <p className="inline-flex items-center gap-2 text-sm uppercase tracking-[0.3em] opacity-60">
              <Bot size={17} />
              <span>AI shopping assistant</span>
              <span className="micro-badge">Beta</span>
            </p>
            <h1 className="section-title mt-2">Describe what you want</h1>
            <p className="mt-3 max-w-2xl opacity-75">
              The assistant turns your request into marketplace filters and keeps checkout rules unchanged.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium">
              {["No auto-purchase", "Review stays required for Mercari, Yahoo, Rakuma", "Amazon and Rakuten stay checkout-eligible"].map(
                (label) => (
                  <span
                    key={label}
                    className="rounded-full border px-3 py-1.5"
                    style={{ borderColor: "var(--line)", background: "rgba(255,255,255,0.62)" }}
                  >
                    {label}
                  </span>
                )
              )}
            </div>
          </div>

          <form onSubmit={handleAssistantSearch} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm opacity-70">Shopping request</span>
              <textarea
                className="input min-h-32 resize-none leading-6"
                placeholder="e.g. Find a used Pokemon card binder under ¥8,000 on Mercari or Rakuma"
                value={assistantMessage}
                onChange={(event) => setAssistantMessage(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {aiSourceChips.map((source) => {
                const active = assistantSelectedSources.includes(source.value);

                return (
                  <button
                    key={source.value}
                    type="button"
                    className="rounded-full border px-3 py-1.5 text-xs font-medium transition"
                    style={{
                      borderColor: active ? "color-mix(in srgb, var(--accent) 38%, var(--line))" : "var(--line)",
                      background: active ? "var(--accent-soft)" : "rgba(255,255,255,0.62)",
                      color: active ? "var(--accent)" : "var(--fg)"
                    }}
                    onClick={() => handleAssistantSourceChip(source.value)}
                    disabled={assistantLoading}
                  >
                    {source.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="submit" className="btn-primary w-full sm:w-auto" disabled={assistantLoading || !assistantMessage.trim()}>
                {assistantLoading ? "Searching..." : "Search with assistant"}
                {!assistantLoading && <Send className="ml-2" size={16} />}
              </button>
              <button
                type="button"
                className="btn-secondary w-full sm:w-auto"
                onClick={handleAssistantClear}
                disabled={assistantLoading || (!assistantMessage && !assistantResponse && !assistantError)}
              >
                Clear search
                <X className="ml-2" size={16} />
              </button>
            </div>
          </form>
        </div>

        <div className="mt-8">
          {assistantError && (
            <div className="rounded-[24px] border px-4 py-3 text-sm text-red-500" style={{ borderColor: "var(--line)" }}>
              {assistantError}
            </div>
          )}

          <AnimatePresence mode="wait">
            {assistantLoading && (
              <motion.div
                key="assistant-loading"
                className="space-y-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.24, ease: "easeOut" }}
              >
                <motion.div
                  className="rounded-[26px] border p-5"
                  style={{
                    borderColor: "var(--line)",
                    background: "linear-gradient(180deg, rgba(255,255,255,0.68), rgba(250,246,241,0.82))"
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.26, ease: "easeOut" }}
                >
                  <p className="text-sm leading-6 opacity-70">{assistantLoadingText}</p>
                  {assistantNormalizationPreview && (
                    <div className="mt-3 space-y-1 text-sm opacity-75">
                      <p>Search keyword: {assistantNormalizationPreview.searchKeywordJa}</p>
                      <p>Marketplace: {assistantNormalizationPreview.marketplaceLabel}</p>
                    </div>
                  )}
                </motion.div>
                <div className="grid-auto">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <motion.div
                      key={`assistant-skeleton-${index}`}
                      className="glass overflow-hidden rounded-[28px]"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.08 + index * 0.04, duration: 0.24, ease: "easeOut" }}
                    >
                      <div className="h-64 w-full animate-pulse bg-[rgba(255,255,255,0.56)]" />
                      <div className="space-y-4 p-6">
                        <div className="h-5 w-24 animate-pulse rounded-full bg-[rgba(255,255,255,0.58)]" />
                        <div className="space-y-2">
                          <div className="h-6 w-5/6 animate-pulse rounded-full bg-[rgba(255,255,255,0.58)]" />
                          <div className="h-6 w-2/3 animate-pulse rounded-full bg-[rgba(255,255,255,0.52)]" />
                        </div>
                        <div className="space-y-2">
                          <div className="h-5 w-1/2 animate-pulse rounded-full bg-[rgba(255,255,255,0.56)]" />
                          <div className="h-4 w-3/4 animate-pulse rounded-full bg-[rgba(255,255,255,0.48)]" />
                        </div>
                        <div className="space-y-2 pt-2">
                          <div className="h-7 w-40 animate-pulse rounded-full bg-[rgba(255,255,255,0.56)]" />
                          <div className="h-4 w-full animate-pulse rounded-full bg-[rgba(255,255,255,0.46)]" />
                          <div className="h-4 w-4/5 animate-pulse rounded-full bg-[rgba(255,255,255,0.42)]" />
                        </div>
                        <div className="pt-3">
                          <div className="h-12 w-full animate-pulse rounded-full bg-[rgba(217,126,146,0.24)]" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {assistantResponse && !assistantLoading && (
            <div className="space-y-5">
              <div
                className="rounded-[26px] border p-5"
                style={{
                  borderColor: "var(--line)",
                  background: "linear-gradient(180deg, rgba(255,255,255,0.68), rgba(250,246,241,0.82))"
                }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                  >
                    <Sparkles size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm leading-6 opacity-80">{assistantResponse.summary}</p>
                    {assistantResponse.normalization && (
                      <motion.div
                        className="mt-3 space-y-1 text-sm opacity-75"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.24, ease: "easeOut" }}
                      >
                        <p>Search keyword: {assistantResponse.normalization.searchKeywordJa}</p>
                        <p>Marketplace: {assistantResponse.normalization.marketplaceLabel}</p>
                      </motion.div>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
                      {assistantResponse.filters?.keyword && (
                        <span className="rounded-full border px-3 py-1.5" style={{ borderColor: "var(--line)" }}>
                          Keyword: {assistantResponse.filters.keyword}
                        </span>
                      )}
                      {assistantResponse.filters?.maxPriceJPY && (
                        <span className="rounded-full border px-3 py-1.5" style={{ borderColor: "var(--line)" }}>
                          Max: ¥{assistantResponse.filters.maxPriceJPY.toLocaleString("ja-JP")}
                        </span>
                      )}
                      {assistantResponse.filters?.category && (
                        <span className="rounded-full border px-3 py-1.5" style={{ borderColor: "var(--line)" }}>
                          Category: {assistantResponse.filters.category}
                        </span>
                      )}
                      {assistantResponse.filters?.preferredSources?.length > 0 && (
                        <span className="rounded-full border px-3 py-1.5" style={{ borderColor: "var(--line)" }}>
                          Sources: {assistantResponse.filters.preferredSources.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {assistantResponse.results?.length > 0 ? (
                <div className="space-y-4">
                  <div className="grid-auto">
                    {assistantResponse.results.map((result) => (
                      <MarketplaceSearchCard key={result.productUrl} result={result} />
                    ))}
                  </div>
                  {assistantResultsAreWeak && (
                    <p className="text-sm leading-6 opacity-70">
                      Not satisfied with these results? Try opening Mercari, Amazon, or Rakuten directly and paste the
                      item link here for a more accurate availability check.
                    </p>
                  )}
                </div>
              ) : (
                <div
                  className="rounded-[26px] border p-5"
                  style={{
                    borderColor: "var(--line)",
                    background: "linear-gradient(180deg, rgba(255,255,255,0.68), rgba(250,246,241,0.82))"
                  }}
                >
                  <p className="text-sm leading-6 opacity-80">
                    We could not find direct listings, but our team can search and confirm options for you.
                  </p>
                  <p className="mt-3 text-sm leading-6 opacity-70">
                    Not satisfied with these results? Try opening Mercari, Amazon, or Rakuten directly and paste the
                    item link here for a more accurate availability check.
                  </p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      className="btn-primary w-full sm:w-auto"
                      onClick={handleAssistantRequest}
                      disabled={assistantRequestBusy}
                    >
                      {assistantRequestBusy ? "Sending..." : "Let us find this for you"}
                    </button>
                    <p className="text-sm opacity-65">We will turn this AI search into a sourcing request for review.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] opacity-60">Catalog</p>
          <h1 className="section-title mt-2">Products from Japan</h1>
        </div>
        <div className="glass flex w-full max-w-full flex-col gap-5 overflow-hidden rounded-[30px] p-5 md:w-auto md:flex-row md:gap-3 md:p-3">
          <label className="flex min-w-0 w-full items-center gap-3 rounded-2xl border px-4 py-3 md:min-w-64" style={{ borderColor: "var(--line)" }}>
            <Search size={18} className="shrink-0 opacity-50" />
            <input
              className="w-full min-w-0 bg-transparent text-sm outline-none"
              placeholder="Search products"
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            />
          </label>
          <select
            className="input w-full md:w-auto"
            value={filters.category}
            onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}
          >
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
          <select
            className="input w-full md:w-auto"
            value={filters.sort}
            onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))}
          >
            <option value="featured">Featured</option>
            <option value="newest">Newest</option>
            <option value="priceAsc">Price low-high</option>
            <option value="priceDesc">Price high-low</option>
            <option value="rating">Top rated</option>
          </select>
        </div>
      </div>
      {error && (
        <div className="mb-6 rounded-[24px] border px-4 py-3 text-sm text-red-500" style={{ borderColor: "var(--line)" }}>
          {error}
        </div>
      )}
      {loading ? (
        <LoadingGrid />
      ) : (
        <div className="grid-auto">{products.map((product) => <ProductCard key={product._id} product={product} />)}</div>
      )}
      <AnimatePresence>
        {assistantLoading && <AIThinkingWidget active={assistantLoading} onCancel={handleAssistantCancelSearch} />}
      </AnimatePresence>
    </section>
  );
};
