import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../services/api";

export const TrackOrderPage = () => {
  const [params] = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(params.get("orderNumber") || "");
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const initial = params.get("orderNumber");
    if (!initial) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .get(`/orders/track/${encodeURIComponent(initial)}`)
      .then((response) => {
        if (!cancelled) setOrder(response.data);
      })
      .catch((err) => {
        if (!cancelled) {
          setOrder(null);
          setError(err.response?.status === 404 ? "Order not found." : "Could not fetch order right now.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params]);

  const track = async (event) => {
    event.preventDefault();
    if (loading) return;
    const trimmed = orderNumber.trim();
    if (!trimmed) {
      setError("Please enter an order number.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const response = await api.get(`/orders/track/${encodeURIComponent(trimmed)}`);
      setOrder(response.data);
    } catch (err) {
      setOrder(null);
      setError(err.response?.status === 404 ? "Order not found." : "Could not fetch order right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="container-shell py-12">
      <div className="mx-auto max-w-3xl glass rounded-[36px] p-8">
        <h1 className="section-title">Track order</h1>
        <form className="mt-8 flex flex-col gap-3 md:flex-row" onSubmit={track}>
          <input
            className="input flex-1"
            placeholder="Enter order number"
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Tracking..." : "Track"}
          </button>
        </form>
        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
        {order && (
          <div className="mt-8 rounded-[28px] border p-5" style={{ borderColor: "var(--line)" }}>
            <p className="text-sm opacity-60">Order</p>
            <p className="mt-2 text-2xl font-semibold">{order.orderNumber}</p>
            <p className="mt-4">
              Status: <span className="font-medium">{order.isDraft ? "draft" : order.orderStatus}</span>
            </p>
            <p className="mt-2">
              Payment: <span className="font-medium">{order.paymentStatus}</span>
            </p>
            {order.isDraft && (
              <p className="mt-2 text-sm opacity-70">
                This order is still a draft and needs checkout completion.
              </p>
            )}
            <p className="mt-2">
              Tracking code: <span className="font-medium">{order.trackingCode || "Pending"}</span>
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
