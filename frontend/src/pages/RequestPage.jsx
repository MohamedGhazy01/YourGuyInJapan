import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";

const isValidUrl = (value = "") => {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};

const statusClasses = {
  pending: "bg-amber-500/15 text-amber-700",
  approved: "bg-emerald-500/15 text-emerald-700",
  rejected: "bg-red-500/15 text-red-600"
};

const requestPlaceholderImage =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#fffaf8"/>
          <stop offset="100%" stop-color="#f5e9e5"/>
        </linearGradient>
      </defs>
      <rect width="640" height="480" fill="url(#bg)"/>
      <circle cx="482" cy="118" r="38" fill="#d97e92" opacity="0.9"/>
      <path d="M190 350 320 180l130 170Z" fill="#7b8d9f"/>
      <path d="M270 246h100l-50-66Z" fill="#fffdfc"/>
      <text x="320" y="415" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="28" fill="#5e5550">
        Requested item
      </text>
    </svg>
  `);

const getRequestTitle = (request) => request.productTitle || request.title || "Requested item";
const getRequestImage = (request) => request.productImage || request.image || requestPlaceholderImage;
const getRequestUrl = (request) => request.productUrl || request.url || "";

const getLinkLabel = (request) => {
  try {
    return new URL(getRequestUrl(request)).hostname.replace(/^www\./i, "");
  } catch {
    return "Open source";
  }
};

const formatJPY = (value) =>
  value == null || value === "" ? "Pending" : `JPY ${Number(value || 0).toLocaleString()}`;

const getPriceBreakdown = (request) => {
  if (
    request.itemPriceJPY === null ||
    request.itemPriceJPY === undefined ||
    request.serviceFeeJPY === null ||
    request.serviceFeeJPY === undefined ||
    request.shippingEstimateJPY === null ||
    request.shippingEstimateJPY === undefined
  ) {
    return null;
  }

  const itemPriceJPY = Number(request.itemPriceJPY);
  const serviceFeeJPY = Number(request.serviceFeeJPY);
  const shippingEstimateJPY = Number(request.shippingEstimateJPY);

  if (![itemPriceJPY, serviceFeeJPY, shippingEstimateJPY].every(Number.isFinite)) {
    return null;
  }

  return {
    itemPriceJPY,
    serviceFeeJPY,
    shippingEstimateJPY,
    totalPriceJPY: Number.isFinite(Number(request.totalPriceJPY))
      ? Number(request.totalPriceJPY)
      : itemPriceJPY + serviceFeeJPY + shippingEstimateJPY
  };
};

const requestTimelineSteps = [
  "Submitted",
  "Review",
  "Quote",
  "Approved",
  "Order"
];

const getRequestTimeline = (request) => {
  if (request.status === "approved") {
    return {
      currentStep: 3,
      completedSteps: [0, 1, 2],
      progressPercent: 75
    };
  }

  if (request.status === "rejected") {
    return {
      currentStep: 1,
      completedSteps: [0],
      progressPercent: 25
    };
  }

  return {
    currentStep: 1,
    completedSteps: [0],
    progressPercent: 25
  };
};

export const RequestPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("link");
  const [url, setUrl] = useState("");
  const [descriptionMessage, setDescriptionMessage] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState({
    title: "",
    budget: "",
    condition: "",
    notes: ""
  });
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [descriptionLoading, setDescriptionLoading] = useState(false);
  const [descriptionError, setDescriptionError] = useState("");
  const [descriptionSuccess, setDescriptionSuccess] = useState("");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [success, setSuccess] = useState("");
  const [continueLoadingId, setContinueLoadingId] = useState("");
  const [continueError, setContinueError] = useState("");

  const loadRequests = async () => {
    setListError("");
    setListLoading(true);

    try {
      const response = await api.get("/proxy-requests/me");
      setRequests(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setRequests([]);
      setListError(err.response?.data?.message || "Could not load your requests.");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  useEffect(() => {
    const trimmedUrl = url.trim();
    let cancelled = false;

    if (!trimmedUrl) {
      setPreview(null);
      setPreviewError("");
      setPreviewLoading(false);
      return undefined;
    }

    if (!isValidUrl(trimmedUrl)) {
      setPreview(null);
      setPreviewError("");
      setPreviewLoading(false);
      return undefined;
    }

    setPreviewLoading(true);
    setPreviewError("");

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await api.get("/preview-product", {
          params: { url: trimmedUrl }
        });
        if (!cancelled) {
          setPreview(response.data);
        }
      } catch (err) {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(err.response?.data?.message || "Could not load a product preview.");
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [url]);

  const submit = async (event) => {
    event.preventDefault();
    if (loading) return;

    const trimmedUrl = url.trim();
    setError("");
    setSuccess("");

    if (!trimmedUrl) {
      setError("Product URL is required.");
      return;
    }

    if (!isValidUrl(trimmedUrl)) {
      setError("Please enter a valid http or https URL.");
      return;
    }

    setLoading(true);

    try {
      const response = await api.post("/proxy-requests", { url: trimmedUrl });
      setListError("");
      setRequests((current) => [response.data, ...current]);
      setUrl("");
      setPreview(null);
      setPreviewError("");
      setSuccess("Your request was submitted and is now pending review.");
    } catch (err) {
      setError(err.response?.data?.message || "Could not submit your request.");
    } finally {
      setLoading(false);
    }
  };

  const generateDescriptionDraft = async (event) => {
    event.preventDefault();
    if (draftLoading) return;

    const userMessage = descriptionMessage.trim();
    setDraftError("");
    setDescriptionError("");
    setDescriptionSuccess("");

    if (!userMessage) {
      setDraftError("Describe the item you want first.");
      return;
    }

    setDraftLoading(true);

    try {
      const response = await api.post("/proxy-requests/ai-draft", { userMessage });
      setDescriptionDraft({
        title: response.data?.title || "",
        budget: response.data?.budget || "",
        condition: response.data?.condition || "",
        notes: response.data?.notes || ""
      });
    } catch (err) {
      setDraftError(err.response?.data?.message || "Could not generate a request draft.");
    } finally {
      setDraftLoading(false);
    }
  };

  const submitDescriptionRequest = async (event) => {
    event.preventDefault();
    if (descriptionLoading) return;

    setDescriptionError("");
    setDescriptionSuccess("");

    if (!descriptionDraft.title.trim()) {
      setDescriptionError("Title is required before submitting.");
      return;
    }

    setDescriptionLoading(true);

    try {
      const response = await api.post("/proxy-requests", {
        title: descriptionDraft.title.trim(),
        budget: descriptionDraft.budget,
        condition: descriptionDraft.condition.trim(),
        notes: descriptionDraft.notes.trim(),
        originalUserMessage: descriptionMessage.trim()
      });
      setListError("");
      setRequests((current) => [response.data, ...current]);
      setDescriptionMessage("");
      setDescriptionDraft({ title: "", budget: "", condition: "", notes: "" });
      setDescriptionSuccess("Your described item request was submitted and is now pending review.");
    } catch (err) {
      setDescriptionError(err.response?.data?.message || "Could not submit your described item request.");
    } finally {
      setDescriptionLoading(false);
    }
  };

  const continueOrdering = async (request) => {
    if (continueLoadingId || request.status !== "approved") {
      return;
    }

    setContinueError("");
    setContinueLoadingId(request._id);

    try {
      const response = await api.post(`/proxy-requests/${request._id}/continue-ordering`);
      const redirectUrl =
        response.data?.redirectUrl ||
        response.data?.checkoutUrl ||
        (response.data?.orderId ? `/checkout?orderId=${response.data.orderId}` : "/checkout");

      navigate(redirectUrl);
    } catch (err) {
      setContinueError(err.response?.data?.message || "Could not continue this approved request.");
    } finally {
      setContinueLoadingId("");
    }
  };

  return (
    <section className="container-shell py-8 md:py-12">
      <div className="mx-auto max-w-3xl space-y-7">
        <div className="glass rounded-[32px] p-6 md:p-8">
          <h1 className="section-title">Request a product</h1>
          <p className="mt-3 opacity-70">
            Paste a product link or describe the item you want, then confirm before submitting.
          </p>

          <div className="mt-8 flex rounded-[22px] border p-1" style={{ borderColor: "var(--line)" }}>
            {[
              ["link", "Paste Link"],
              ["describe", "Describe Item"]
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="flex-1 rounded-[18px] px-4 py-3 text-sm font-semibold transition"
                style={{
                  background: activeTab === value ? "var(--accent-soft)" : "transparent",
                  color: activeTab === value ? "var(--accent)" : "var(--fg)"
                }}
                onClick={() => setActiveTab(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === "link" && (
            <form className="mt-6 space-y-4" onSubmit={submit}>
              <label className="block">
                <span className="mb-2 block text-sm opacity-70">Product URL</span>
                <input
                  className="input"
                  type="url"
                  placeholder="https://example.com/product"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                />
              </label>

              {previewLoading && <p className="text-sm opacity-70">Loading product preview...</p>}
              {!previewLoading && previewError && (
                <p className="text-sm text-red-500">{previewError}</p>
              )}
              {preview && (
                <div className="rounded-[28px] border p-6" style={{ borderColor: "var(--line)" }}>
                  <p className="text-xs uppercase tracking-[0.24em] opacity-60">Live preview</p>
                  <div className="mt-4 flex flex-col gap-4 sm:flex-row">
                    <img
                      src={preview.image}
                      alt={preview.title}
                      className="h-40 w-full rounded-[24px] object-cover sm:h-32 sm:w-32 sm:shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs uppercase tracking-[0.24em] opacity-60">{preview.source}</p>
                      <h2 className="mt-2 text-xl font-semibold">{preview.title}</h2>
                      {preview.price && <p className="mt-3 text-lg font-semibold">{preview.price}</p>}
                      <a
                        href={preview.sourceUrl || preview.url}
                        target="_blank"
                        rel="noreferrer"
                        className="break-anywhere mt-3 block text-sm underline underline-offset-4 opacity-70"
                      >
                        {preview.sourceUrl || preview.url}
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-red-500">{error}</p>}
              {success && <p className="text-sm text-emerald-600">{success}</p>}

              <button type="submit" className="btn-primary w-full sm:w-auto" disabled={loading || previewLoading}>
                {loading ? "Submitting..." : "Submit request"}
              </button>
            </form>
          )}

          {activeTab === "describe" && (
            <div className="mt-6 space-y-5">
              <form className="space-y-4" onSubmit={generateDescriptionDraft}>
                <label className="block">
                  <span className="mb-2 block text-sm opacity-70">Describe the item</span>
                  <textarea
                    className="input min-h-32 resize-none leading-6"
                    placeholder="e.g. I want a used Porter Yoshida shoulder bag under ¥18,000, black if possible."
                    value={descriptionMessage}
                    onChange={(event) => setDescriptionMessage(event.target.value)}
                  />
                </label>
                {draftError && <p className="text-sm text-red-500">{draftError}</p>}
                <button type="submit" className="btn-primary w-full sm:w-auto" disabled={draftLoading}>
                  {draftLoading ? "Generating..." : "Generate Request"}
                </button>
              </form>

              {(descriptionDraft.title || descriptionDraft.budget || descriptionDraft.condition || descriptionDraft.notes) && (
                <form className="space-y-4 rounded-[28px] border p-5" style={{ borderColor: "var(--line)" }} onSubmit={submitDescriptionRequest}>
                  <p className="text-xs uppercase tracking-[0.24em] opacity-60">Availability check details</p>
                  <label className="block">
                    <span className="mb-2 block text-sm opacity-70">Title</span>
                    <input
                      className="input"
                      value={descriptionDraft.title}
                      onChange={(event) => setDescriptionDraft((current) => ({ ...current, title: event.target.value }))}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm opacity-70">Budget (JPY)</span>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="1"
                        value={descriptionDraft.budget}
                        onChange={(event) => setDescriptionDraft((current) => ({ ...current, budget: event.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm opacity-70">Condition</span>
                      <input
                        className="input"
                        placeholder="New, used, any condition..."
                        value={descriptionDraft.condition}
                        onChange={(event) => setDescriptionDraft((current) => ({ ...current, condition: event.target.value }))}
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-2 block text-sm opacity-70">Notes</span>
                    <textarea
                      className="input min-h-28 resize-none leading-6"
                      value={descriptionDraft.notes}
                      onChange={(event) => setDescriptionDraft((current) => ({ ...current, notes: event.target.value }))}
                    />
                  </label>
                  {descriptionError && <p className="text-sm text-red-500">{descriptionError}</p>}
                  {descriptionSuccess && <p className="text-sm text-emerald-600">{descriptionSuccess}</p>}
                  <button type="submit" className="btn-primary w-full sm:w-auto" disabled={descriptionLoading}>
                    {descriptionLoading ? "Submitting..." : "Submit described item request"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        <div className="glass rounded-[32px] p-6 md:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-2xl font-semibold">My requests</h2>
            <button type="button" className="btn-secondary w-full sm:w-auto" onClick={loadRequests} disabled={listLoading}>
              {listLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="mt-6 space-y-6">
            {listLoading && <p className="opacity-70">Loading your requests...</p>}
            {!listLoading && listError && (
              <div
                className="rounded-[24px] border px-4 py-3 text-sm text-red-500"
                style={{ borderColor: "var(--line)" }}
              >
                {listError}
              </div>
            )}
            {!listLoading && !listError && requests.length === 0 && (
              <p className="opacity-70">You haven&apos;t submitted any product requests yet.</p>
            )}
            {!listLoading && !listError && continueError && (
              <div
                className="rounded-[24px] border px-4 py-3 text-sm text-red-500"
                style={{ borderColor: "var(--line)" }}
              >
                {continueError}
              </div>
            )}
            {!listLoading &&
              !listError &&
              requests.map((request) => {
                const priceBreakdown = getPriceBreakdown(request);
                const timeline = getRequestTimeline(request);

                return (
                  <div
                    key={request._id}
                    className="rounded-[24px] border p-6"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row">
                      <img
                        src={getRequestImage(request)}
                        alt={getRequestTitle(request)}
                        className="h-32 w-full rounded-[22px] object-cover sm:h-28 sm:w-28 sm:shrink-0"
                        onError={(event) => {
                          event.currentTarget.src = requestPlaceholderImage;
                        }}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h3 className="text-xl font-semibold">{getRequestTitle(request)}</h3>
                            <p className="mt-1 text-sm opacity-60">Requested through proxy sourcing</p>
                          </div>
                          <span
                            className={`w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                              statusClasses[request.status] || "bg-slate-500/15 text-slate-700"
                            }`}
                          >
                            {request.status}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          {getRequestUrl(request) ? (
                            <>
                              <a
                                href={getRequestUrl(request)}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-secondary"
                              >
                                Item Link
                              </a>
                              <span className="text-sm opacity-60">{getLinkLabel(request)}</span>
                            </>
                          ) : (
                            <span className="rounded-full border px-3 py-1.5 text-sm opacity-70" style={{ borderColor: "var(--line)" }}>
                              Described item
                            </span>
                          )}
                        </div>

                        {request.requestedCondition && (
                          <p className="mt-3 text-sm opacity-70">Condition: {request.requestedCondition}</p>
                        )}
                        {request.requestedBudgetJPY && (
                          <p className="mt-1 text-sm opacity-70">Budget: {formatJPY(request.requestedBudgetJPY)}</p>
                        )}
                        {request.customerNotes && (
                          <p className="mt-3 whitespace-pre-line text-sm opacity-70">{request.customerNotes}</p>
                        )}

                        <div className="timeline timeline-container mt-4 rounded-[22px] border" style={{ borderColor: "var(--line)" }}>
                          <p className="text-xs uppercase tracking-[0.24em] opacity-60">Request timeline</p>
                          <div className="mt-2">
                            <div className="timeline-wrapper">
                              <div className="timeline-progress px-2">
                              <div className="timeline-track">
                              <div
                                className="timeline-line absolute left-0 right-0 rounded-full"
                                style={{ background: "rgba(140, 121, 111, 0.2)" }}
                              />
                              <div
                                className="timeline-line absolute left-0 rounded-full transition-all duration-500 ease-out"
                                style={{
                                  width: `${timeline.progressPercent}%`,
                                  background:
                                    "linear-gradient(90deg, color-mix(in srgb, var(--accent) 82%, white), var(--accent))"
                                }}
                              />
                                <div className="timeline-steps">
                                {requestTimelineSteps.map((step, index) => {
                                  const isComplete = timeline.completedSteps.includes(index);
                                  const isCurrent = timeline.currentStep === index;

                                  return (
                                    <div key={step} className="timeline-step">
                                      <span
                                        className="timeline-step-dot inline-flex items-center justify-center rounded-full border-2 transition-all duration-300"
                                        style={{
                                          borderColor: isComplete || isCurrent
                                            ? "var(--accent)"
                                            : "rgba(140, 121, 111, 0.28)",
                                          background: isComplete
                                            ? "var(--accent)"
                                            : isCurrent
                                              ? "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,244,239,0.96))"
                                              : "rgba(255,255,255,0.92)",
                                          boxShadow: isCurrent
                                            ? "0 0 0 6px rgba(217, 126, 146, 0.12)"
                                            : "none",
                                          color: isComplete ? "#fffaf8" : isCurrent ? "var(--accent)" : "rgba(94,85,80,0.58)"
                                        }}
                                      />
                                    </div>
                                  );
                                })}
                                </div>
                              </div>
                              <div className="timeline-label-row">
                                {requestTimelineSteps.map((step, index) => {
                                  const isComplete = timeline.completedSteps.includes(index);
                                  const isCurrent = timeline.currentStep === index;
                                  const isFuture = !isComplete && !isCurrent;

                                  return (
                                    <span
                                      key={step}
                                      className="timeline-label font-medium leading-5 transition-colors duration-300"
                                      style={{
                                        color: isCurrent
                                          ? "var(--accent)"
                                          : isFuture
                                            ? "rgba(94,85,80,0.56)"
                                            : "rgba(94,85,80,0.82)"
                                      }}
                                    >
                                      {step}
                                    </span>
                                  );
                                })}
                              </div>
                              <p
                                className="timeline-current-status mt-2 text-center text-sm font-medium md:hidden"
                                style={{ color: "var(--accent)" }}
                              >
                                {requestTimelineSteps[timeline.currentStep]}
                              </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {request.status === "approved" && (
                          <div className="mt-3 space-y-3">
                            <p className="text-sm opacity-70">
                              Your request was approved. Please review the price before continuing.
                            </p>
                            {priceBreakdown ? (
                              <div className="rounded-[20px] border p-4 text-sm" style={{ borderColor: "var(--line)" }}>
                                {[
                                  ["Item price", priceBreakdown.itemPriceJPY],
                                  ["Service fee", priceBreakdown.serviceFeeJPY],
                                  ["Shipping estimate", priceBreakdown.shippingEstimateJPY]
                                ].map(([label, value]) => (
                                  <div key={label} className="flex items-center justify-between gap-4 py-1">
                                    <span className="opacity-70">{label}</span>
                                    <span className="font-medium">{formatJPY(value)}</span>
                                  </div>
                                ))}
                                <div className="mt-3 flex items-center justify-between gap-4 border-t pt-3 text-base font-semibold" style={{ borderColor: "var(--line)" }}>
                                  <span>Total</span>
                                  <span>{formatJPY(priceBreakdown.totalPriceJPY)}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-[20px] border px-4 py-3 text-sm opacity-70" style={{ borderColor: "var(--line)" }}>
                                Price breakdown is being finalized.
                              </div>
                            )}
                            <div>
                              <button
                                type="button"
                                className="btn-primary"
                                disabled={continueLoadingId === request._id || !priceBreakdown}
                                onClick={() => continueOrdering(request)}
                              >
                                {continueLoadingId === request._id ? "Opening checkout..." : "Continue Ordering"}
                              </button>
                            </div>
                          </div>
                        )}

                        {request.status === "pending" && (
                          <div className="mt-3 space-y-1">
                            <p className="text-sm opacity-70">
                              Waiting for availability check. We&apos;ll update this request once it has been checked.
                            </p>
                            <p className="text-xs opacity-60">Usually confirmed within 10-30 minutes</p>
                          </div>
                        )}

                        {request.status === "rejected" && (
                          <p className="mt-3 text-sm text-red-500">
                            {request.adminNotes
                              ? `Decline reason: ${request.adminNotes}`
                              : "This request was declined."}
                          </p>
                        )}

                        {request.adminNotes && request.status !== "rejected" && (
                          <p className="mt-3 text-sm opacity-70">Admin note: {request.adminNotes}</p>
                        )}

                        {request.createdAt && (
                          <p className="mt-3 text-xs opacity-60">
                            Submitted {new Date(request.createdAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </section>
  );
};
