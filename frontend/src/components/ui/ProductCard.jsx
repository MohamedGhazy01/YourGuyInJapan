import { motion } from "framer-motion";
import { Heart, Star } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppProvider";
import api from "../../services/api";
import { getCheckoutMeta, getCheckoutPresentation } from "../../utils/checkoutRules";
import { formatMoney, fallbackMediaUrl, mediaUrl } from "../../utils/format";

export const ProductCard = ({ product }) => {
  const navigate = useNavigate();
  const { addToCart, currency, auth, wishlist, toggleWishlist, setNotice } = useApp();
  const wished = wishlist.some((item) => item._id === product._id);
  const [imageSrc, setImageSrc] = useState(() => mediaUrl(product.media?.[0]));
  const [wishBusy, setWishBusy] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const checkoutMeta = getCheckoutMeta(product);
  const checkoutPresentation = getCheckoutPresentation(product);

  const handleWishlist = async () => {
    if (wishBusy) return;
    setWishBusy(true);
    const success = await toggleWishlist(product._id);
    setWishBusy(false);
    if (!success && !auth?.token) {
      navigate("/auth");
    }
  };

  const handleAddToCart = () => {
    addToCart(product);
    setAddedToCart(true);
    window.setTimeout(() => setAddedToCart(false), 1600);
    setNotice(`${product.title} added to cart.`);
  };

  const handlePrimaryAction = async () => {
    if (actionBusy) return;

    if (checkoutMeta.checkoutAction === "request_review") {
      if (!auth?.token) {
        setNotice("Please sign in to request an availability check for this marketplace.");
        navigate("/auth");
        return;
      }

      setActionBusy(true);

      try {
        const response = await api.post("/proxy-requests", { productId: product._id });
        setNotice(
          response.data?.existing
            ? "This item already has an active availability check request."
            : "Availability check request submitted."
        );
        navigate("/request");
      } catch (error) {
        setNotice(error.response?.data?.message || "Could not create an availability check request.");
      } finally {
        setActionBusy(false);
      }

      return;
    }

    if (checkoutMeta.checkoutAction === "checkout_now") {
      addToCart(product);
      setNotice(`${product.title} added to cart.`);
      navigate("/checkout");
      return;
    }

    handleAddToCart();
  };

  return (
    <motion.article whileHover={{ y: -6 }} className="glass flex h-full flex-col overflow-hidden rounded-[28px]">
      <div className="relative">
        <img
          src={imageSrc}
          alt={product.media?.[0]?.alt || product.title}
          className="h-72 w-full object-cover"
          loading="lazy"
          onError={() => setImageSrc(fallbackMediaUrl(product.media?.[0]))}
        />
        <button
          type="button"
          className={`absolute right-4 top-4 rounded-full border p-3 transition-colors ${
            wished ? "wishlist-button-active" : ""
          }`}
          style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", opacity: wishBusy ? 0.6 : 1 }}
          onClick={handleWishlist}
          disabled={wishBusy}
          aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
        >
          <Heart size={16} fill={wished ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="flex flex-1 flex-col space-y-5 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] opacity-60">{product.category}</p>
            <Link to={`/products/${product.slug}`} className="mt-2 block text-xl font-semibold">
              {product.title}
            </Link>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">{formatMoney(product.price, currency)}</p>
            {product.compareAtPrice && (
              <p className="text-sm line-through opacity-50">
                {formatMoney(product.compareAtPrice, currency)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm opacity-70">
          <Star size={14} fill="currentColor" />
          <span>{product.ratingAverage?.toFixed(1) || "New"} rating</span>
        </div>
        {checkoutPresentation.badgeText && (
          <div className="space-y-2">
            <span
              className="inline-flex w-fit rounded-full border px-3 py-1.5 text-xs font-medium"
              style={{
                borderColor: "var(--line)",
                background: "rgba(255,255,255,0.72)",
                color: checkoutPresentation.requiresProxyApproval ? "#8a5a1f" : "var(--accent)"
              }}
            >
              {checkoutPresentation.badgeText}
            </span>
            {checkoutPresentation.note && (
              <p className="text-sm leading-6 opacity-70">{checkoutPresentation.note}</p>
            )}
          </div>
        )}
        <div className="mt-auto flex flex-nowrap items-stretch gap-3 pt-2">
          <Link to={`/products/${product.slug}`} className="btn-secondary flex-1 whitespace-nowrap">
            View
          </Link>
          <button
            type="button"
            className={`flex-1 whitespace-nowrap ${
              checkoutMeta.checkoutAction === "add_to_cart" && addedToCart ? "btn-success" : "btn-primary"
            }`}
            onClick={handlePrimaryAction}
            disabled={actionBusy}
          >
            {actionBusy
              ? checkoutMeta.checkoutAction === "request_review"
                ? "Submitting..."
                : "Opening..."
              : checkoutMeta.checkoutAction === "add_to_cart" && addedToCart
                ? "Added to cart"
                : checkoutMeta.checkoutLabel}
          </button>
        </div>
      </div>
    </motion.article>
  );
};
