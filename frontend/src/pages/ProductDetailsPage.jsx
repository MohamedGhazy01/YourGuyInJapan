import { Heart, Minus, Plus, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, useParams } from "react-router-dom";
import { ShippingEstimator } from "../components/store/ShippingEstimator";
import { useApp } from "../context/AppProvider";
import api from "../services/api";
import { getCheckoutMeta, getCheckoutPresentation } from "../utils/checkoutRules";
import { fallbackMediaUrl, formatMoney, mediaUrl, starArray } from "../utils/format";

export const ProductDetailsPage = () => {
  const navigate = useNavigate();
  const { slug } = useParams();
  const { addToCart, currency, auth, wishlist, toggleWishlist, setNotice } = useApp();
  const [product, setProduct] = useState(null);
  const [activeMedia, setActiveMedia] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [review, setReview] = useState({ rating: 5, comment: "" });
  const [reviewError, setReviewError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mediaSrc, setMediaSrc] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const fetchProduct = () => {
    setLoading(true);
    setLoadError("");
    api
      .get(`/products/${slug}`, { params: { currency } })
      .then((response) => setProduct(response.data))
      .catch((error) => {
        setProduct(null);
        if (error.response?.status === 404) {
          setLoadError("Product not found.");
        } else {
          setLoadError("Could not load this product. Please try again.");
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setActiveMedia(0);
    setQuantity(1);
  }, [slug]);

  useEffect(() => {
    fetchProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, currency]);

  const currentMedia = product?.media?.[activeMedia];

  useEffect(() => {
    setMediaSrc(mediaUrl(currentMedia));
  }, [currentMedia]);

  if (loading) {
    return <section className="container-shell py-16">Loading product...</section>;
  }

  if (loadError || !product) {
    return <section className="container-shell py-16">{loadError || "Product not found."}</section>;
  }

  const wished = wishlist.some((item) => item._id === product._id);
  const checkoutMeta = getCheckoutMeta(product);
  const checkoutPresentation = getCheckoutPresentation(product);

  const submitReview = async (event) => {
    event.preventDefault();
    setReviewError("");

    if (!review.comment.trim()) {
      setReviewError("Please write a short review before submitting.");
      return;
    }

    setSubmittingReview(true);
    try {
      await api.post(`/products/${product._id}/reviews`, {
        ...review,
        comment: review.comment.trim()
      });
      setReview({ rating: 5, comment: "" });
      setNotice("Review submitted.");
      fetchProduct();
    } catch (error) {
      setReviewError(error.response?.data?.message || "Could not submit your review.");
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleWishlist = async () => {
    const success = await toggleWishlist(product._id);
    if (!success && !auth.token) {
      navigate("/auth");
    }
  };

  const handleAddToCart = () => {
    addToCart(product, quantity);
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
      addToCart(product, quantity);
      setNotice(`${product.title} added to cart.`);
      navigate("/checkout");
      return;
    }

    handleAddToCart();
  };

  return (
    <section className="container-shell py-12">
      <Helmet>
        <title>{product.title} | YourGuyInJapan.com</title>
      </Helmet>
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="glass overflow-hidden rounded-[36px]">
            {currentMedia?.type === "video" ? (
              <video src={mediaSrc} controls className="h-[520px] w-full object-cover" />
            ) : (
              <img
                src={mediaSrc}
                alt={product.title}
                className="h-[520px] w-full object-cover"
                onError={() => setMediaSrc(fallbackMediaUrl(currentMedia))}
              />
            )}
          </div>
          <div className="grid grid-cols-4 gap-3">
            {product.media?.map((media, index) => {
              const thumbSrc = mediaUrl(media);
              return (
                <button
                  type="button"
                  key={`${media.url}-${index}`}
                  className="glass overflow-hidden rounded-[24px]"
                  onClick={() => setActiveMedia(index)}
                >
                  {media.type === "video" ? (
                    <video src={thumbSrc} className="h-24 w-full object-cover" />
                  ) : (
                    <img src={thumbSrc} alt="" className="h-24 w-full object-cover" loading="lazy" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass rounded-[36px] p-8">
            <p className="text-sm uppercase tracking-[0.3em] opacity-60">{product.category}</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">{product.title}</h1>
            <div className="mt-4 flex items-center gap-2 text-sm opacity-75">
              <Star size={16} fill="currentColor" className="review-star" />
              <span>
                {product.ratingAverage ? product.ratingAverage.toFixed(1) : "New"} | {product.ratingCount || 0} reviews
              </span>
            </div>
            <p className="mt-6 text-3xl font-semibold">{formatMoney(product.price, currency)}</p>
            {checkoutPresentation.badgeText && (
              <div className="mt-5 space-y-3">
                <span
                  className="inline-flex w-fit rounded-full border px-4 py-2 text-sm font-medium"
                  style={{
                    borderColor: "var(--line)",
                    background: "rgba(255,255,255,0.74)",
                    color: checkoutPresentation.requiresProxyApproval ? "#8a5a1f" : "var(--accent)"
                  }}
                >
                  {checkoutPresentation.badgeText}
                </span>
                {checkoutPresentation.note && (
                  <p className="max-w-2xl text-sm leading-6 opacity-70">{checkoutPresentation.note}</p>
                )}
              </div>
            )}
            <p className="mt-6 text-base leading-7 opacity-75">{product.description}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              {product.trustBadges?.map((badge) => (
                <span key={badge} className="rounded-full border px-4 py-2 text-sm" style={{ borderColor: "var(--line)" }}>
                  {badge}
                </span>
              ))}
            </div>
            <div className="mt-8 flex items-center gap-3">
              <div className="glass flex items-center rounded-full px-3 py-2">
                <button type="button" onClick={() => setQuantity((value) => Math.max(value - 1, 1))}>
                  <Minus size={16} />
                </button>
                <span className="px-4">{quantity}</span>
                <button type="button" onClick={() => setQuantity((value) => value + 1)}>
                  <Plus size={16} />
                </button>
              </div>
              <button
                type="button"
                className={`flex-1 ${
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
              <button
                type="button"
                className={`btn-secondary !p-3 ${wished ? "wishlist-button-active" : ""}`}
                onClick={handleWishlist}
              >
                <Heart size={18} fill={wished ? "currentColor" : "none"} />
              </button>
            </div>
          </div>

          <ShippingEstimator
            itemCount={quantity}
            cartItems={[
              {
                title: product.title,
                category: product.category,
                quantity,
                weightKg: product.weightKg,
                packageDimensionsCm: product.packageDimensionsCm
              }
            ]}
          />

          <div className="glass rounded-[36px] p-8">
            <h2 className="text-2xl font-semibold">Reviews & ratings</h2>
            <div className="mt-6 space-y-4">
              {product.reviews?.length ? (
                product.reviews.map((entry, index) => (
                  <div key={entry._id || index} className="rounded-[24px] border p-4" style={{ borderColor: "var(--line)" }}>
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{entry.name || entry.user?.name}</p>
                      <div className="flex items-center gap-1 review-star">
                        {starArray().map((value) => (
                          <Star
                            key={value}
                            size={14}
                            fill={value <= Number(entry.rating || 0) ? "currentColor" : "none"}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="mt-3 opacity-75">{entry.comment}</p>
                  </div>
                ))
              ) : (
                <p className="opacity-70">No reviews yet.</p>
              )}
            </div>
            {auth.user && (
              <form className="mt-6 space-y-3" onSubmit={submitReview}>
                <div className="flex gap-2">
                  {starArray().map((value) => (
                    <button
                      key={value}
                      type="button"
                      className="review-star"
                      onClick={() => setReview((current) => ({ ...current, rating: value }))}
                    >
                      <Star size={18} fill={value <= review.rating ? "currentColor" : "none"} />
                    </button>
                  ))}
                </div>
                <textarea
                  className="input min-h-28"
                  placeholder="Share your experience"
                  value={review.comment}
                  onChange={(event) => setReview((current) => ({ ...current, comment: event.target.value }))}
                />
                {reviewError && <p className="text-sm text-red-500">{reviewError}</p>}
                <button type="submit" className="btn-primary" disabled={submittingReview}>
                  {submittingReview ? "Posting..." : "Post review"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
