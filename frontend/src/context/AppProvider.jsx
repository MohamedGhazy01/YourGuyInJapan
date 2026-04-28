import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import api, { setApiToken, setUnauthorizedHandler } from "../services/api";
import { convertFromJPY } from "../utils/format";

const AppContext = createContext(null);

const readStorage = (key, fallback) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
};

export const AppProvider = ({ children }) => {
  const [theme] = useState("light");
  const [currency, setCurrency] = useState(() => readStorage("ygj-currency", "USD"));
  const [cart, setCart] = useState(() => readStorage("ygj-cart", []));
  const [auth, setAuth] = useState(() => readStorage("ygj-auth", { token: "", user: null }));
  const [wishlist, setWishlist] = useState([]);
  const [notice, setNotice] = useState("");
  const setTheme = () => {};

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("ygj-theme", JSON.stringify("light"));
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("ygj-currency", JSON.stringify(currency));
  }, [currency]);

  useEffect(() => {
    localStorage.setItem("ygj-cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem("ygj-auth", JSON.stringify(auth));
    setApiToken(auth.token);
  }, [auth]);

  const hadTokenRef = useRef(Boolean(auth.token));
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (hadTokenRef.current) {
        setAuth({ token: "", user: null });
        setWishlist([]);
        setNotice("Your session expired. Please sign in again.");
      }
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    hadTokenRef.current = Boolean(auth.token);
  }, [auth.token]);

  useEffect(() => {
    if (!auth.token) {
      setWishlist([]);
      return;
    }

    api
      .get("/auth/me")
      .then((response) => {
        setAuth((current) => ({ ...current, user: response.data.user }));
      })
      .catch(() => {
        setAuth({ token: "", user: null });
        setWishlist([]);
        setNotice("Your session expired. Please sign in again.");
      });
  }, [auth.token]);

  useEffect(() => {
    if (!auth.token) return;
    let cancelled = false;

    api
      .get("/users/wishlist", { params: { currency } })
      .then((response) => {
        if (!cancelled) setWishlist(Array.isArray(response.data) ? response.data : []);
      })
      .catch((err) => {
        if (cancelled) return;
        // Don't clobber wishlist on 401 — the 401 handler will sign us out.
        if (err?.response?.status !== 401) {
          setWishlist([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [auth.token, currency]);

  const priceFor = (item) => {
    if (item?.priceJPY != null) return convertFromJPY(item.priceJPY, currency);
    return Number(item?.price || 0);
  };

  const addToCart = (product, quantity = 1) => {
    const safeQty = Math.max(1, Math.floor(Number(quantity) || 1));
    setCart((current) => {
      const existing = current.find((item) => item._id === product._id);
      if (existing) {
        return current.map((item) =>
          item._id === product._id ? { ...item, quantity: item.quantity + safeQty } : item
        );
      }

      return [
        ...current,
        {
          _id: product._id,
          title: product.title,
          slug: product.slug,
          category: product.category,
          media: product.media,
          source: product.source,
          sourceUrl: product.sourceUrl,
          checkoutAction: product.checkoutAction,
          checkoutLabel: product.checkoutLabel,
          requiresProxyApproval: product.requiresProxyApproval,
          canCheckoutNow: product.canCheckoutNow,
          priceJPY: product.priceJPY,
          price: product.price,
          weightKg: product.weightKg,
          packageDimensionsCm: product.packageDimensionsCm,
          quantity: safeQty
        }
      ];
    });
  };

  const updateCartQuantity = (_id, quantity) => {
    const parsed = Math.floor(Number(quantity));
    if (!Number.isFinite(parsed) || parsed < 1) return;
    setCart((current) =>
      current.map((item) => (item._id === _id ? { ...item, quantity: parsed } : item))
    );
  };

  const removeFromCart = (_id) => setCart((current) => current.filter((item) => item._id !== _id));

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + priceFor(item) * item.quantity, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart, currency]
  );

  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
    [cart]
  );

  const toggleWishlist = async (productId) => {
    if (!auth.token) {
      setNotice("Please sign in to save items to your wishlist.");
      return false;
    }

    try {
      const response = await api.post(`/users/wishlist?currency=${currency}`, { productId });
      setWishlist(response.data);
      return true;
    } catch {
      setNotice("Wishlist update failed. Please try again.");
      return false;
    }
  };

  return (
    <AppContext.Provider
      value={{
        theme,
        setTheme,
        currency,
        setCurrency,
        cart,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        setCart,
        cartTotal,
        cartCount,
        priceFor,
        auth,
        setAuth,
        wishlist,
        toggleWishlist,
        notice,
        setNotice
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
