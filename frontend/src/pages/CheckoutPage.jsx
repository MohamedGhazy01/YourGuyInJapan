import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ShippingEstimator } from "../components/store/ShippingEstimator";
import { useApp } from "../context/AppProvider";
import api from "../services/api";
import { convertFromJPY, formatMoney } from "../utils/format";

export const CheckoutPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { cart, cartTotal, currency, auth, setCart, priceFor, cartCount } = useApp();
  const draftOrderId = searchParams.get("orderId") || "";
  const proxyRequestId = searchParams.get("proxyRequestId") || "";
  const [form, setForm] = useState({
    fullName: auth.user?.name || "",
    email: auth.user?.email || "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "United States",
    phone: ""
  });
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [draftOrder, setDraftOrder] = useState(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [proxyRequest, setProxyRequest] = useState(null);
  const [proxyLoading, setProxyLoading] = useState(false);

  useEffect(() => {
    if (!draftOrderId) {
      setDraftOrder(null);
      return;
    }

    let cancelled = false;
    setDraftLoading(true);
    setError("");

    api
      .get(`/orders/${draftOrderId}`)
      .then((response) => {
        if (cancelled) return;
        setDraftOrder(response.data);
        setForm((current) => ({
          ...current,
          fullName: response.data?.shippingAddress?.fullName || auth.user?.name || current.fullName,
          email: response.data?.shippingAddress?.email || auth.user?.email || current.email,
          line1: response.data?.shippingAddress?.line1 || "",
          line2: response.data?.shippingAddress?.line2 || "",
          city: response.data?.shippingAddress?.city || "",
          state: response.data?.shippingAddress?.state || "",
          postalCode: response.data?.shippingAddress?.postalCode || "",
          country: response.data?.shippingAddress?.country || current.country,
          phone: response.data?.shippingAddress?.phone || ""
        }));
      })
      .catch((err) => {
        if (cancelled) return;
        setDraftOrder(null);
        setError(err.response?.data?.message || "Could not load this draft order.");
      })
      .finally(() => {
        if (!cancelled) {
          setDraftLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [auth.user?.email, auth.user?.name, draftOrderId]);

  useEffect(() => {
    if (!proxyRequestId) {
      setProxyRequest(null);
      return;
    }

    let cancelled = false;
    setProxyLoading(true);
    setError("");

    api
      .get(`/proxy-requests/${proxyRequestId}/checkout`)
      .then((response) => {
        if (cancelled) return;
        setProxyRequest(response.data);
      })
      .catch((err) => {
        if (cancelled) return;
        setProxyRequest(null);
        setError(err.response?.data?.message || "Could not load this approved request.");
      })
      .finally(() => {
        if (!cancelled) {
          setProxyLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [proxyRequestId]);

  const proxyItemTitle = proxyRequest?.productTitle || proxyRequest?.title || "Requested item";
  const proxySummaryItems = proxyRequest
    ? [
        { title: proxyItemTitle, amountJPY: Number(proxyRequest.itemPriceJPY || 0) },
        { title: "Service fee", amountJPY: Number(proxyRequest.serviceFeeJPY || 0) },
        { title: "Shipping estimate", amountJPY: Number(proxyRequest.shippingEstimateJPY || 0) }
      ]
    : [];
  const summaryItems = proxyRequestId ? proxySummaryItems : draftOrderId ? draftOrder?.items || [] : cart;
  const summaryTotal = draftOrderId
    ? Number(draftOrder?.totalJPY || draftOrder?.subtotalJPY || 0)
    : proxyRequestId
      ? Number(proxyRequest?.totalPriceJPY || 0)
    : cartTotal;
  const submitDisabled = proxyRequestId
    ? placing || proxyLoading || !proxyRequest
    : draftOrderId
      ? placing || draftLoading || !draftOrder
      : placing || !cart.length;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!draftOrderId && !proxyRequestId && !cart.length) return;
    if (draftOrderId && !draftOrder) return;
    if (proxyRequestId && !proxyRequest) return;

    setPlacing(true);
    try {
      const response = proxyRequestId
        ? await api.post(`/proxy-requests/${proxyRequestId}/order`, {
            shippingAddress: form,
            currency,
            paymentMethod: "mock"
          })
        : draftOrderId
          ? await api.post(`/orders/${draftOrderId}/complete`, {
            shippingAddress: form,
            currency,
            paymentMethod: "mock"
          })
        : await api.post("/orders", {
            items: cart.map((item) => ({ productId: item._id, quantity: item.quantity })),
            shippingAddress: form,
            currency,
            paymentMethod: "mock"
          });

      if (!draftOrderId && !proxyRequestId) {
        setCart([]);
      }

      navigate(`/track-order?orderNumber=${response.data.orderNumber}`);
    } catch (err) {
      setError(err.response?.data?.message || "Could not place your order.");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <section className="container-shell py-12">
      <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <form className="glass rounded-[28px] p-5 md:rounded-[36px] md:p-8" onSubmit={handleSubmit}>
          <h1 className="section-title">Checkout</h1>
          <p className="mt-3 opacity-70">
            {draftOrderId
              ? "Review your approved proxy request draft and finish checkout."
              : proxyRequestId
                ? "Review your approved proxy request and finish checkout."
              : "You must be signed in to place an order."}
          </p>
          {draftOrderId && draftOrder?.sourceUrl && (
            <a
              href={draftOrder.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="break-anywhere mt-4 block text-sm underline underline-offset-4 opacity-70"
            >
              Source link: {draftOrder.sourceUrl}
            </a>
          )}
          {proxyRequestId && proxyRequest && (
            <a
              href={proxyRequest.productUrl || proxyRequest.url}
              target="_blank"
              rel="noreferrer"
              className="break-anywhere mt-4 block text-sm underline underline-offset-4 opacity-70"
            >
              Source link: {proxyRequest.productUrl || proxyRequest.url}
            </a>
          )}
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {Object.entries(form).map(([key, value]) => (
              <label key={key} className={key === "line2" ? "md:col-span-2" : ""}>
                <span className="mb-2 block text-sm capitalize opacity-70">{key}</span>
                <input
                  className="input"
                  value={value}
                  onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                  required={["fullName", "email", "line1", "city", "postalCode", "country"].includes(key)}
                />
              </label>
            ))}
          </div>
          {draftLoading && <p className="mt-4 text-sm opacity-70">Loading draft order...</p>}
          {proxyLoading && <p className="mt-4 text-sm opacity-70">Loading approved request...</p>}
          {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
          <button type="submit" className="btn-primary mt-8 w-full md:w-auto" disabled={submitDisabled}>
            {placing ? "Processing..." : draftOrderId || proxyRequestId ? "Complete order" : "Place order"}
          </button>
        </form>

        <div className="space-y-4">
          <div className="glass rounded-[28px] p-5 md:rounded-[36px] md:p-8">
            <h2 className="text-2xl font-semibold">Order summary</h2>
            <div className="mt-6 space-y-4">
              {summaryItems.map((item, index) => (
                <div key={item._id || `${item.title}-${index}`} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{item.title}</p>
                    {!proxyRequestId && <p className="text-sm opacity-60">Qty {item.quantity}</p>}
                  </div>
                  <p>
                    {proxyRequestId
                      ? formatMoney(convertFromJPY(Number(item.amountJPY || 0), currency), currency)
                      : draftOrderId && item.priceJPY == null
                      ? draftOrder?.estimatedPriceText || "Estimate pending"
                      : formatMoney(
                          draftOrderId
                            ? convertFromJPY(Number(item.priceJPY || 0) * item.quantity, currency)
                            : priceFor(item) * item.quantity,
                          currency
                        )}
                  </p>
                </div>
              ))}
              {draftOrderId && !summaryItems.length && !draftLoading && (
                <p className="opacity-70">This draft order does not contain any items.</p>
              )}
            </div>
            <div className="mt-6 border-t pt-4" style={{ borderColor: "var(--line)" }}>
              <div className="flex justify-between text-lg font-semibold">
                <span>Total</span>
                <span>
                  {draftOrderId && !summaryTotal && draftOrder?.estimatedPriceText
                    ? draftOrder.estimatedPriceText
                    : formatMoney(
                        draftOrderId || proxyRequestId ? convertFromJPY(summaryTotal, currency) : summaryTotal,
                        currency
                      )}
                </span>
              </div>
              <p className="mt-2 text-sm opacity-60">
                {draftOrderId && !summaryTotal
                  ? "Estimated pricing is still pending confirmation for this proxy request."
                  : "Stripe-ready backend included; current UI uses mock checkout by default."}
              </p>
            </div>
          </div>

          {!draftOrderId && !proxyRequestId && (
            <ShippingEstimator itemCount={cartCount} cartItems={cart} autoEstimate />
          )}
        </div>
      </div>
    </section>
  );
};
