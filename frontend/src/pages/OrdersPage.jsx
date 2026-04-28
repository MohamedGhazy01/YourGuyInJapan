import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";

export const OrdersPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .get("/orders/mine")
      .then((response) => {
        if (!cancelled) setOrders(Array.isArray(response.data) ? response.data : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setOrders([]);
          setError(err.response?.data?.message || "Could not load your orders.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="container-shell py-12">
      <h1 className="section-title">My orders</h1>
      <div className="mt-8 space-y-4">
        {loading && <p className="opacity-70">Loading your orders...</p>}
        {!loading && error && (
          <div className="rounded-[24px] border px-4 py-3 text-sm text-red-500" style={{ borderColor: "var(--line)" }}>
            {error}
          </div>
        )}
        {!loading && !error && orders.length === 0 && (
          <div className="glass rounded-[28px] p-6">
            <p>You don&apos;t have any orders yet.</p>
            <Link to="/products" className="btn-primary mt-4">
              Browse products
            </Link>
          </div>
        )}
        {!loading && !error &&
          orders.map((order) => (
            <Link
              key={order._id}
              to={`/track-order?orderNumber=${encodeURIComponent(order.orderNumber || "")}`}
              className="glass block rounded-[28px] p-5 transition hover:-translate-y-0.5"
            >
              <p className="text-lg font-semibold">{order.orderNumber}</p>
              <p className="mt-2 opacity-70 capitalize">{order.isDraft ? "draft" : order.orderStatus}</p>
              {order.createdAt && (
                <p className="mt-1 text-xs opacity-60">
                  {new Date(order.createdAt).toLocaleString()}
                </p>
              )}
            </Link>
          ))}
      </div>
    </section>
  );
};
