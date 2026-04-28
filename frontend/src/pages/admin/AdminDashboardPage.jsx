import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api";
import { useApp } from "../../context/AppProvider";
import { formatMoney } from "../../utils/format";

const initialProduct = {
  title: "",
  slug: "",
  description: "",
  category: "",
  brand: "YourGuyInJapan",
  priceJPY: "",
  compareAtPriceJPY: "",
  stock: "",
  featured: false,
  tags: "",
  trustBadges: ""
};

export const AdminDashboardPage = () => {
  const { setNotice } = useApp();
  const [stats, setStats] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [proxyRequests, setProxyRequests] = useState([]);
  const [form, setForm] = useState(initialProduct);
  const [files, setFiles] = useState([]);
  const [editingId, setEditingId] = useState("");
  const [error, setError] = useState("");
  const [proxyError, setProxyError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [proxyLoading, setProxyLoading] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState("");
  const [pendingOrderId, setPendingOrderId] = useState("");
  const [pendingProxyId, setPendingProxyId] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState("");
  const [proxyQuoteDrafts, setProxyQuoteDrafts] = useState({});

  const loadDashboard = async () => {
    setError("");
    setLoading(true);

    try {
      const [statsRes, productsRes, ordersRes, usersRes] = await Promise.all([
        api.get("/users/dashboard/stats"),
        api.get("/products"),
        api.get("/orders"),
        api.get("/users")
      ]);

      setStats(statsRes.data);
      setProducts(productsRes.data?.products || []);
      setOrders(Array.isArray(ordersRes.data) ? ordersRes.data : []);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
    } catch (err) {
      setError(err.response?.data?.message || "Admin data could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    loadProxyRequests();
  }, []);

  const loadProxyRequests = async () => {
    setProxyError("");
    setProxyLoading(true);

    try {
      const response = await api.get("/proxy-requests");
      setProxyRequests(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setProxyRequests([]);
      setProxyError(err.response?.data?.message || "Proxy requests could not be loaded.");
    } finally {
      setProxyLoading(false);
    }
  };

  const createProduct = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");

    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => payload.append(key, value));
    Array.from(files).forEach((file) => payload.append("media", file));

    try {
      if (editingId) {
        await api.put(`/products/${editingId}`, payload);
        setNotice("Product updated.");
      } else {
        await api.post("/products", payload);
        setNotice("Product created.");
      }

      setForm(initialProduct);
      setFiles([]);
      setEditingId("");
      loadDashboard();
    } catch (err) {
      setError(err.response?.data?.message || "Product could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (id, title) => {
    if (pendingDeleteId) return;
    const confirmed = window.confirm(`Delete "${title || "this product"}"? This cannot be undone.`);
    if (!confirmed) return;

    setPendingDeleteId(id);
    setError("");
    try {
      await api.delete(`/products/${id}`);
      setNotice("Product deleted.");
      if (editingId === id) {
        setEditingId("");
        setForm(initialProduct);
        setFiles([]);
      }
      loadDashboard();
    } catch (err) {
      setError(err.response?.data?.message || "Product could not be deleted.");
    } finally {
      setPendingDeleteId("");
    }
  };

  const updateOrder = async (id, orderStatus) => {
    if (pendingOrderId) return;
    setPendingOrderId(id);
    setError("");
    const previous = orders;
    // Optimistic UI update so the admin sees the change immediately.
    setOrders((current) =>
      current.map((order) => (order._id === id ? { ...order, orderStatus } : order))
    );
    try {
      await api.put(`/orders/${id}/status`, { orderStatus });
      setNotice("Order status updated.");
      loadDashboard();
    } catch (err) {
      setOrders(previous);
      setError(err.response?.data?.message || "Order status could not be updated.");
    } finally {
      setPendingOrderId("");
    }
  };

  const getProxyQuoteValue = (request, field) =>
    proxyQuoteDrafts[request._id]?.[field] ?? request[field] ?? "";

  const updateProxyQuoteDraft = (id, field, value) => {
    setProxyQuoteDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        [field]: value
      }
    }));
  };

  const getProxyQuotePayload = (request) => ({
    itemPriceJPY: getProxyQuoteValue(request, "itemPriceJPY"),
    serviceFeeJPY: getProxyQuoteValue(request, "serviceFeeJPY"),
    shippingEstimateJPY: getProxyQuoteValue(request, "shippingEstimateJPY")
  });

  const getProxyQuoteTotal = (request) => {
    const quote = getProxyQuotePayload(request);
    const rawValues = [quote.itemPriceJPY, quote.serviceFeeJPY, quote.shippingEstimateJPY];
    if (rawValues.some((value) => value === "" || value === null || value === undefined)) return null;
    const values = rawValues.map(Number);
    return values.every(Number.isFinite) ? values.reduce((sum, value) => sum + Math.max(0, Math.round(value)), 0) : null;
  };

  const formatJPY = (value) =>
    value == null || value === "" ? "Pending" : `JPY ${Number(value || 0).toLocaleString()}`;

  const updateProxyRequest = async (request, status) => {
    if (pendingProxyId) return;
    const id = request._id;
    setPendingProxyId(id);
    setProxyError("");

    try {
      const response = await api.put(`/proxy-requests/${id}`, {
        status,
        ...getProxyQuotePayload(request)
      });
      setProxyRequests((current) =>
        current.map((request) => (request._id === id ? response.data : request))
      );
      setNotice(`Proxy request ${status}.`);
    } catch (err) {
      setProxyError(err.response?.data?.message || "Proxy request could not be updated.");
    } finally {
      setPendingProxyId("");
    }
  };

  const startEdit = (product) => {
    setEditingId(product._id);
    setForm({
      title: product.title || "",
      slug: product.slug || "",
      description: product.description || "",
      category: product.category || "",
      brand: product.brand || "YourGuyInJapan",
      priceJPY: product.priceJPY || "",
      compareAtPriceJPY: product.compareAtPriceJPY || "",
      stock: product.stock || "",
      featured: Boolean(product.featured),
      tags: product.tags?.join(", ") || "",
      trustBadges: product.trustBadges?.join(", ") || ""
    });
  };

  const formatOrderTotal = (order) => {
    if (order?.currency && order?.exchangeRate) {
      return formatMoney(Number(order.totalJPY || 0) * Number(order.exchangeRate || 0), order.currency);
    }

    return `JPY ${Number(order?.totalJPY || 0).toLocaleString()}`;
  };

  const formatOrderItemPrice = (order, item) => {
    if (order?.currency && order?.exchangeRate && item?.priceJPY != null) {
      return formatMoney(Number(item.priceJPY || 0) * Number(order.exchangeRate || 0), order.currency);
    }

    if (item?.priceJPY != null) {
      return `JPY ${Number(item.priceJPY || 0).toLocaleString()}`;
    }

    return "Pending";
  };

  const formatOrderItemSubtotal = (order, item) => {
    const subtotalJPY = Number(item?.priceJPY || 0) * Number(item?.quantity || 0);

    if (order?.currency && order?.exchangeRate && item?.priceJPY != null) {
      return formatMoney(subtotalJPY * Number(order.exchangeRate || 0), order.currency);
    }

    if (item?.priceJPY != null) {
      return `JPY ${subtotalJPY.toLocaleString()}`;
    }

    return "Pending";
  };

  const shippingAddressLines = (order) =>
    [
      order?.shippingAddress?.line1,
      order?.shippingAddress?.line2,
      [
        order?.shippingAddress?.city,
        order?.shippingAddress?.state,
        order?.shippingAddress?.postalCode
      ]
        .filter(Boolean)
        .join(", "),
      order?.shippingAddress?.country
    ].filter(Boolean);

  return (
    <section className="container-shell py-12">
      <h1 className="section-title">Admin dashboard</h1>
      {error && (
        <div className="mt-6 rounded-[24px] border px-4 py-3 text-sm text-red-500" style={{ borderColor: "var(--line)" }}>
          {error}
        </div>
      )}
      {loading && !stats && <p className="mt-6 opacity-70">Loading dashboard...</p>}
      <div className="mt-8 grid gap-7 md:grid-cols-4">
        {stats &&
          [
            ["Orders", Number(stats.orders || 0).toLocaleString()],
            ["Revenue (JPY)", `¥${Number(stats.revenueJPY || 0).toLocaleString()}`],
            ["Products", Number(stats.products || 0).toLocaleString()],
            ["Users", Number(stats.users || 0).toLocaleString()]
          ].map(([label, value]) => (
            <div key={label} className="glass rounded-[28px] p-6">
              <p className="text-sm opacity-60">{label}</p>
              <p className="mt-3 text-3xl font-semibold">{value}</p>
            </div>
          ))}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1fr]">
        <form className="glass rounded-[32px] p-6" onSubmit={createProduct}>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold">{editingId ? "Edit product" : "Add product"}</h2>
            <div className="flex gap-2">
              <Link to="/admin/products/create" className="btn-secondary">
                Paste link generator
              </Link>
              {editingId && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setEditingId("");
                    setForm(initialProduct);
                    setFiles([]);
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
          <div className="mt-6 grid gap-3">
            {Object.entries(form).map(([key, value]) => (
              <label key={key}>
                <span className="mb-2 block text-sm capitalize opacity-70">{key}</span>
                {typeof value === "boolean" ? (
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.checked }))}
                  />
                ) : (
                  <input
                    className="input"
                    value={value}
                    onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                  />
                )}
              </label>
            ))}
            <input type="file" multiple onChange={(event) => setFiles(event.target.files)} />
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save changes" : "Create product"}
            </button>
          </div>
        </form>

        <div className="space-y-6">
          <div className="glass rounded-[32px] p-6">
            <h2 className="text-2xl font-semibold">Products</h2>
            <div className="mt-6 space-y-6">
              {products.slice(0, 6).map((product) => (
                <div key={product._id} className="flex items-center justify-between gap-4 rounded-[20px] border p-6" style={{ borderColor: "var(--line)" }}>
                  <div>
                    <p className="font-medium">{product.title}</p>
                    <p className="text-sm opacity-60">{product.category}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-secondary" onClick={() => startEdit(product)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => deleteProduct(product._id, product.title)}
                      disabled={pendingDeleteId === product._id}
                    >
                      {pendingDeleteId === product._id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-[32px] p-6">
            <h2 className="text-2xl font-semibold">Recent orders</h2>
            <div className="mt-6 space-y-6">
              {orders.map((order) => (
                <div key={order._id} className="rounded-[20px] border p-6" style={{ borderColor: "var(--line)" }}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{order.orderNumber}</p>
                      <div className="mt-2 grid gap-1 text-sm opacity-70 sm:grid-cols-2">
                        <p>{order.shippingAddress?.fullName || order.user?.name || "Unknown customer"}</p>
                        <p>{formatOrderTotal(order)}</p>
                        <p>{order.createdAt ? new Date(order.createdAt).toLocaleString() : "Date unavailable"}</p>
                        <p className="capitalize">{order.orderStatus}</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          setExpandedOrderId((current) => (current === order._id ? "" : order._id))
                        }
                      >
                        {expandedOrderId === order._id ? "Hide details" : "View details"}
                      </button>
                      <select
                        className="input !w-auto"
                        value={order.orderStatus}
                        disabled={pendingOrderId === order._id}
                        onChange={(event) => updateOrder(order._id, event.target.value)}
                      >
                        {["processing", "shipped", "delivered"].map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {expandedOrderId === order._id && (
                    <div className="mt-5 grid gap-7 lg:grid-cols-2">
                      <div className="rounded-[20px] border p-6" style={{ borderColor: "var(--line)" }}>
                        <p className="text-xs uppercase tracking-[0.24em] opacity-60">Customer Info</p>
                        <div className="mt-3 space-y-2 text-sm">
                          <p>
                            <span className="opacity-60">Name:</span>{" "}
                            {order.shippingAddress?.fullName || order.user?.name || "Unknown"}
                          </p>
                          <p>
                            <span className="opacity-60">Email:</span>{" "}
                            {order.shippingAddress?.email || order.user?.email || "Not provided"}
                          </p>
                          <p>
                            <span className="opacity-60">Phone:</span>{" "}
                            {order.shippingAddress?.phone || "Not provided"}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-[20px] border p-6" style={{ borderColor: "var(--line)" }}>
                        <p className="text-xs uppercase tracking-[0.24em] opacity-60">Shipping Address</p>
                        <div className="mt-3 space-y-1 text-sm">
                          {shippingAddressLines(order).length ? (
                            shippingAddressLines(order).map((line) => <p key={line}>{line}</p>)
                          ) : (
                            <p className="opacity-70">No shipping address yet.</p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-[20px] border p-6 lg:col-span-2" style={{ borderColor: "var(--line)" }}>
                        <p className="text-xs uppercase tracking-[0.24em] opacity-60">Items Ordered</p>
                        <div className="mt-4 space-y-6">
                          {order.items?.length ? (
                            order.items.map((item, index) => (
                              <div
                                key={`${item.title || "item"}-${index}`}
                                className="grid gap-4 rounded-[16px] border p-4 text-sm md:grid-cols-[minmax(0,1.4fr)_auto_auto_auto]"
                                style={{ borderColor: "var(--line)" }}
                              >
                                <p className="font-medium">{item.title || "Untitled item"}</p>
                                <p>Qty {item.quantity || 0}</p>
                                <p>{formatOrderItemPrice(order, item)}</p>
                                <p>{formatOrderItemSubtotal(order, item)}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm opacity-70">No items on this order.</p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-[20px] border p-6" style={{ borderColor: "var(--line)" }}>
                        <p className="text-xs uppercase tracking-[0.24em] opacity-60">Payment / Total</p>
                        <div className="mt-3 space-y-2 text-sm">
                          <p>
                            <span className="opacity-60">Total:</span> {formatOrderTotal(order)}
                          </p>
                          <p>
                            <span className="opacity-60">Shipping:</span>{" "}
                            {order.shippingJPY != null
                              ? `JPY ${Number(order.shippingJPY || 0).toLocaleString()}`
                              : "Not available"}
                          </p>
                          <p>
                            <span className="opacity-60">Payment method:</span>{" "}
                            {order.paymentMethod || "Not available"}
                          </p>
                          <p>
                            <span className="opacity-60">Payment status:</span>{" "}
                            {order.paymentStatus || "Not available"}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-[20px] border p-6" style={{ borderColor: "var(--line)" }}>
                        <p className="text-xs uppercase tracking-[0.24em] opacity-60">Status</p>
                        <div className="mt-3 space-y-2 text-sm">
                          <p>
                            <span className="opacity-60">Order status:</span> {order.orderStatus}
                          </p>
                          <p>
                            <span className="opacity-60">Order date:</span>{" "}
                            {order.createdAt ? new Date(order.createdAt).toLocaleString() : "Unknown"}
                          </p>
                          <p>
                            <span className="opacity-60">Notes:</span> {order.notes || "No notes"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-[32px] p-6">
            <h2 className="text-2xl font-semibold">Users</h2>
            <div className="mt-6 space-y-6">
              {users.slice(0, 6).map((user) => (
                <div key={user._id} className="flex items-center justify-between rounded-[20px] border p-6" style={{ borderColor: "var(--line)" }}>
                  <div>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-sm opacity-60">{user.email}</p>
                  </div>
                  <p className="text-sm uppercase opacity-60">{user.role}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-[32px] p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold">Proxy requests</h2>
              <button type="button" className="btn-secondary" onClick={loadProxyRequests} disabled={proxyLoading}>
                {proxyLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {proxyError && (
              <div className="mt-6 rounded-[24px] border px-4 py-3 text-sm text-red-500" style={{ borderColor: "var(--line)" }}>
                {proxyError}
              </div>
            )}

            <div className="mt-6 space-y-6">
              {proxyLoading && <p className="opacity-70">Loading proxy requests...</p>}
              {!proxyLoading && !proxyError && proxyRequests.length === 0 && (
                <p className="opacity-70">No proxy requests yet.</p>
              )}
              {!proxyLoading &&
                !proxyError &&
                proxyRequests.map((request) => (
                  <div key={request._id} className="rounded-[20px] border p-6" style={{ borderColor: "var(--line)" }}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{request.user?.email || "Unknown user"}</p>
                        {request.url ? (
                          <a
                            href={request.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 block break-all text-sm underline underline-offset-4 opacity-80"
                          >
                            {request.url}
                          </a>
                        ) : (
                          <p className="mt-1 text-sm opacity-80">{request.productTitle || request.title || "Described item"}</p>
                        )}
                        {request.requestedCondition && (
                          <p className="mt-1 text-sm opacity-60">Condition: {request.requestedCondition}</p>
                        )}
                        {request.requestedBudgetJPY && (
                          <p className="mt-1 text-sm opacity-60">Budget: {formatJPY(request.requestedBudgetJPY)}</p>
                        )}
                        {request.customerNotes && (
                          <p className="mt-2 whitespace-pre-line text-sm opacity-70">{request.customerNotes}</p>
                        )}
                        <p className="mt-2 text-sm capitalize opacity-60">{request.status}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={pendingProxyId === request._id}
                          onClick={() => updateProxyRequest(request, "approved")}
                        >
                          {pendingProxyId === request._id ? "Saving..." : "Approve"}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={pendingProxyId === request._id}
                          onClick={() => updateProxyRequest(request, "rejected")}
                        >
                          {pendingProxyId === request._id ? "Saving..." : "Reject"}
                        </button>
                      </div>
                    </div>
                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                      {[
                        ["itemPriceJPY", "Item price"],
                        ["serviceFeeJPY", "Service fee"],
                        ["shippingEstimateJPY", "Shipping estimate"]
                      ].map(([field, label]) => (
                        <label key={field}>
                          <span className="mb-2 block text-sm opacity-70">{label} (JPY)</span>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="1"
                            value={getProxyQuoteValue(request, field)}
                            onChange={(event) => updateProxyQuoteDraft(request._id, field, event.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-4 rounded-[18px] border px-4 py-3 text-sm" style={{ borderColor: "var(--line)" }}>
                      <div className="flex items-center justify-between gap-4">
                        <span className="opacity-70">Customer total</span>
                        <span className="font-semibold">
                          {formatJPY(getProxyQuoteTotal(request) ?? request.totalPriceJPY)}
                        </span>
                      </div>
                    </div>
                    {request.adminNotes && <p className="mt-3 text-sm opacity-70">{request.adminNotes}</p>}
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
