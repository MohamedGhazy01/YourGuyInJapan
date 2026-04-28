import { CircleUserRound, Globe2, Heart, House, Info, Menu, PackageSearch, SearchCheck, Send, ShoppingBag, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useApp } from "../../context/AppProvider";
import { supportedCurrencies } from "../../utils/format";

const baseTabs = [
  { to: "/", label: "Home", icon: House },
  { to: "/products", label: "Shop", icon: PackageSearch },
  { to: "/wishlist", label: "Saved", icon: Heart },
  { to: "/cart", label: "Cart", icon: ShoppingBag }
];

export const MobileTabBar = () => {
  const location = useLocation();
  const { auth, cartCount, currency, setCurrency } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const accountPath = auth.user?.role === "admin" ? "/admin" : auth.user ? "/orders" : "/auth";
  const tabs = baseTabs;

  useEffect(() => {
    setMenuOpen(false);
    setCurrencyOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
    };
  }, [menuOpen]);

  const handleMenuClose = () => {
    setMenuOpen(false);
    setCurrencyOpen(false);
  };

  const handleCurrencySelect = (code) => {
    setCurrency(code);
    setCurrencyOpen(false);
  };

  return (
    <>
      {menuOpen && (
        <div className="mobile-menu-sheet-backdrop md:hidden" role="presentation" onClick={handleMenuClose}>
          <div
            className="mobile-menu-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile menu"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mobile-menu-sheet-header">
              <span>Menu</span>
              <button type="button" className="mobile-menu-sheet-close" aria-label="Close menu" onClick={handleMenuClose}>
                <X size={18} />
              </button>
            </div>

            <div className="mobile-menu-sheet-links">
              <Link to={accountPath} className="mobile-menu-sheet-link" onClick={handleMenuClose}>
                <CircleUserRound size={18} />
                <span>Account</span>
              </Link>

              <button
                type="button"
                className="mobile-menu-sheet-link"
                aria-expanded={currencyOpen}
                onClick={() => setCurrencyOpen((current) => !current)}
              >
                <Globe2 size={18} />
                <span>Currency</span>
                <span className="mobile-menu-sheet-meta">{currency}</span>
              </button>

              {currencyOpen && (
                <div className="mobile-menu-currency-grid">
                  {supportedCurrencies.map((entry) => (
                    <button
                      key={entry.code}
                      type="button"
                      className={`mobile-menu-currency-option ${currency === entry.code ? "mobile-menu-currency-option-active" : ""}`}
                      onClick={() => handleCurrencySelect(entry.code)}
                    >
                      {entry.code}
                    </button>
                  ))}
                </div>
              )}

              <Link to="/track-order" className="mobile-menu-sheet-link" onClick={handleMenuClose}>
                <SearchCheck size={18} />
                <span>Track Order</span>
              </Link>

              <Link to="/products#ai-search" className="mobile-menu-sheet-link" onClick={handleMenuClose}>
                <PackageSearch size={18} />
                <span>AI Search</span>
              </Link>

              <Link to="/request" className="mobile-menu-sheet-link" onClick={handleMenuClose}>
                <Send size={18} />
                <span>Request Item</span>
              </Link>

              <Link to="/about" className="mobile-menu-sheet-link" onClick={handleMenuClose}>
                <Info size={18} />
                <span>About</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      <nav className="mobile-tabbar md:hidden">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `mobile-tab ${isActive ? "mobile-tab-active" : ""}`}>
            <span className="relative">
              <Icon size={18} />
              {to === "/cart" && cartCount > 0 && (
                <span className="mobile-tab-badge">{cartCount > 99 ? "99+" : cartCount}</span>
              )}
            </span>
            <span>{label}</span>
          </NavLink>
        ))}

        <button
          type="button"
          className={`mobile-tab ${menuOpen ? "mobile-tab-active" : ""}`}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <Menu size={18} />
          <span>Menu</span>
        </button>
      </nav>
    </>
  );
};
