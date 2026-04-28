import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppProvider";
import api from "../../services/api";
import { convertFromJPY, formatMoney } from "../../utils/format";

const fallbackMarketplaceImage =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 540">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#fffaf7"/>
          <stop offset="100%" stop-color="#f1e1dc"/>
        </linearGradient>
      </defs>
      <rect width="720" height="540" fill="url(#bg)"/>
      <rect x="110" y="96" width="500" height="280" rx="30" fill="#fffdfb" stroke="#ead9d3"/>
      <circle cx="560" cy="126" r="46" fill="#d97e92" opacity="0.92"/>
      <text x="360" y="432" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="32" fill="#4f4540">
        Marketplace result
      </text>
    </svg>
  `);

const lowConfidenceMarketplaceImage =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 540">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#fffaf7"/>
          <stop offset="100%" stop-color="#f6e7e2"/>
        </linearGradient>
      </defs>
      <rect width="720" height="540" fill="url(#bg)"/>
      <rect x="110" y="96" width="500" height="280" rx="30" fill="#fffdfb" stroke="#ead9d3"/>
      <text x="360" y="246" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="28" fill="#5b514c">
        Product photo available
      </text>
      <text x="360" y="286" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="28" fill="#5b514c">
        on the store page
      </text>
    </svg>
  `);

const isBrokenMarketplaceTitle = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return true;
  const replacementCount = (text.match(/\uFFFD|�/g) || []).length;
  return replacementCount >= 2 || (replacementCount > 0 && replacementCount / Math.max(text.length, 1) > 0.08);
};

export const MarketplaceSearchCard = ({ result }) => {
  const navigate = useNavigate();
  const { auth, setNotice } = useApp();
  const prefersPlaceholder = result.imageConfidence === "low" || !result.image;
  const [imageSrc, setImageSrc] = useState(prefersPlaceholder ? lowConfidenceMarketplaceImage : result.image);
  const [requestBusy, setRequestBusy] = useState(false);
  const displayTitle = isBrokenMarketplaceTitle(result.title) ? "Product title to be confirmed" : result.title;
  const isOfficial = result.sourceConfidence === "official";
  const sourceConfidenceLabel = isOfficial ? "Verified price" : "Price may change";
  const hasPrice =
    Number.isFinite(Number(result.priceJPY)) && Number(result.priceJPY) > 0 && result.priceConfidence !== "unknown";
  const referencePrice = hasPrice
    ? `${formatMoney(result.priceJPY, "JPY")} (${formatMoney(convertFromJPY(result.priceJPY, "USD"), "USD")})`
    : "Price to be confirmed";

  const trackMarketplaceCardClick = (actionType) => {
    console.log("[marketplace-card-action]", {
      actionType,
      marketplace: result.source,
      productTitle: displayTitle,
      productUrl: result.productUrl,
      sourceConfidence: result.sourceConfidence,
      priceJPY: result.priceJPY ?? null,
      timestamp: new Date().toISOString(),
      component: "MarketplaceSearchCard"
    });
  };

  const ensureSignedIn = (message) => {
    if (auth?.token) return true;
    setNotice(message);
    navigate("/auth");
    return false;
  };

  const handleRequestItem = async () => {
    if (requestBusy) return;
    if (!ensureSignedIn("Please sign in to request this marketplace item.")) return;

    trackMarketplaceCardClick("request_this_item");
    setRequestBusy(true);
    try {
      const response = await api.post("/proxy-requests", { url: result.productUrl });
      setNotice(
        response.data?.existing
          ? "This marketplace item already has an active request."
          : "Marketplace item request submitted."
      );
      navigate("/request");
    } catch (error) {
      setNotice(error.response?.data?.message || "Could not request this item.");
    } finally {
      setRequestBusy(false);
    }
  };

  return (
    <motion.article whileHover={{ y: -6 }} className="glass flex h-full flex-col overflow-hidden rounded-[28px]">
      <div className="relative">
        <img
          src={imageSrc}
          alt={displayTitle}
          className="h-64 w-full object-cover"
          loading="lazy"
          onError={() => setImageSrc(lowConfidenceMarketplaceImage || fallbackMarketplaceImage)}
        />
        <span
          className="absolute left-4 top-4 inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold"
          style={{
            borderColor: "var(--line)",
            background: "rgba(255,255,255,0.82)",
            color: "var(--fg)"
          }}
        >
          {result.source}
        </span>
      </div>

      <div className="flex flex-1 flex-col space-y-4 p-6">
        <div className="space-y-3">
          <h3 className="text-xl font-semibold leading-8">{displayTitle}</h3>
          <span
            className="inline-flex w-fit rounded-full border px-3 py-1.5 text-xs font-medium"
            style={{
              borderColor: isOfficial ? "rgba(88, 162, 108, 0.28)" : "var(--line)",
              background: isOfficial ? "rgba(88, 162, 108, 0.12)" : "rgba(255,255,255,0.72)",
              color: isOfficial ? "#2f7a46" : "#8a5a1f"
            }}
          >
            {sourceConfidenceLabel}
          </span>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-lg font-semibold">
                {hasPrice ? `Reference price: ${referencePrice}` : referencePrice}
              </p>
              <p className="text-sm leading-6 opacity-70">Final price confirmed after availability check</p>
            </div>
            <a
              href={result.productUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm opacity-70 transition-opacity hover:opacity-100"
            >
              Source
              <ExternalLink size={14} />
            </a>
          </div>
        </div>

        <div className="space-y-2">
          {isOfficial ? (
            <p className="text-sm leading-6 opacity-70">Final price confirmed after availability check</p>
          ) : (
            <>
              <span
                className="inline-flex w-fit rounded-full border px-3 py-1.5 text-xs font-medium"
                style={{
                  borderColor: "var(--line)",
                  background: "rgba(255,255,255,0.72)",
                  color: "#8a5a1f"
                }}
              >
                Availability check required
              </span>
              <p className="text-sm leading-6 opacity-70">
                Usually confirmed within 10-30 minutes. Final price confirmed after availability check.
              </p>
            </>
          )}
        </div>

        <div className="mt-auto space-y-3 pt-2">
          {isOfficial ? (
            <a
              href={result.productUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-primary flex w-full items-center justify-center"
              onClick={() => trackMarketplaceCardClick("buy_now")}
            >
              Buy now
            </a>
          ) : (
            <button type="button" className="btn-primary w-full" onClick={handleRequestItem} disabled={requestBusy}>
              {requestBusy ? "Submitting..." : "Request this item"}
            </button>
          )}
        </div>
      </div>
    </motion.article>
  );
};
