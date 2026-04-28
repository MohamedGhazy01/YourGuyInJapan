import { Link } from "react-router-dom";
import { ShippingEstimator } from "../components/store/ShippingEstimator";
import { useApp } from "../context/AppProvider";
import { getCheckoutMeta } from "../utils/checkoutRules";
import { formatMoney, mediaUrl, fallbackMediaUrl } from "../utils/format";

export const CartPage = () => {
  const { cart, currency, cartTotal, cartCount, priceFor, updateCartQuantity, removeFromCart } = useApp();
  const reviewRequiredItems = cart.filter((item) => getCheckoutMeta(item).requiresProxyApproval);
  const checkoutBlocked = !cart.length || reviewRequiredItems.length > 0;

  return (
    <section className="container-shell py-12">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <h1 className="section-title">Cart</h1>
          {!cart.length && (
            <div className="glass rounded-[28px] p-6 md:rounded-[32px] md:p-8">
              <p>Your cart is empty.</p>
              <Link to="/products" className="btn-primary mt-4">
                Explore products
              </Link>
            </div>
          )}
          {cart.map((item) => (
            <div key={item._id} className="glass flex flex-col gap-4 rounded-[28px] p-4 md:rounded-[32px] md:p-5 md:flex-row">
              <img
                src={mediaUrl(item.media?.[0])}
                alt={item.title}
                className="h-36 w-full rounded-[24px] object-cover md:w-40"
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = fallbackMediaUrl(item.media?.[0]);
                }}
              />
              <div className="flex-1">
                <h2 className="text-xl font-semibold">{item.title}</h2>
                <p className="mt-2 opacity-70">{formatMoney(priceFor(item), currency)}</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="input !w-24"
                    value={item.quantity}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isFinite(next) && next >= 1) {
                        updateCartQuantity(item._id, next);
                      }
                    }}
                    onBlur={(event) => {
                      const next = Number(event.target.value);
                      if (!Number.isFinite(next) || next < 1) {
                        updateCartQuantity(item._id, 1);
                      }
                    }}
                  />
                  <button type="button" className="btn-secondary" onClick={() => removeFromCart(item._id)}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <div className="glass rounded-[28px] p-5 md:rounded-[32px] md:p-6">
            <p className="text-lg font-semibold">Order summary</p>
            <div className="mt-4 flex justify-between text-sm opacity-70">
              <span>Items</span>
              <span>{cartCount}</span>
            </div>
            <div className="mt-2 flex justify-between text-lg font-semibold">
              <span>Subtotal</span>
              <span>{formatMoney(cartTotal, currency)}</span>
            </div>
            {reviewRequiredItems.length > 0 && (
              <div
                className="mt-4 rounded-[20px] border px-4 py-3 text-sm text-amber-700"
                style={{ borderColor: "var(--line)" }}
              >
                <p>
                  Availability check is required before checkout for: {reviewRequiredItems.map((item) => item.title).join(", ")}
                </p>
                <p className="mt-1 text-xs opacity-70">Usually confirmed within 10-30 minutes</p>
              </div>
            )}
            <Link
              to="/checkout"
              className="btn-primary mt-6 w-full"
              aria-disabled={checkoutBlocked}
              onClick={(event) => {
                if (checkoutBlocked) event.preventDefault();
              }}
              style={checkoutBlocked ? { opacity: 0.5, pointerEvents: "none" } : undefined}
            >
              {reviewRequiredItems.length > 0 ? "Availability Check Required" : "Proceed to checkout"}
            </Link>
          </div>
          <ShippingEstimator itemCount={cartCount} cartItems={cart} autoEstimate />
        </div>
      </div>
    </section>
  );
};
