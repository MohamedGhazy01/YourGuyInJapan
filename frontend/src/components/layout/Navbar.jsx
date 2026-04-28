import { ChevronRight, Heart, Menu, Settings, ShoppingBag, Sparkles, User, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import logo from "../../assets/logo.png";
import { useApp } from "../../context/AppProvider";
import { supportedCurrencies } from "../../utils/format";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/products", label: "Products" },
  { to: "/request", label: "Request Item", recommended: true },
  { to: "/track-order", label: "Track" },
  { to: "/about", label: "About" }
];

const CurrencyFlag = ({ country }) => {
  switch (country) {
    case "JP":
      return (
        <svg viewBox="0 0 20 14" aria-hidden="true" className="currency-flag">
          <rect width="20" height="14" rx="2" fill="#ffffff" />
          <circle cx="10" cy="7" r="4" fill="#dc2626" />
        </svg>
      );
    case "US":
      return (
        <svg viewBox="0 0 20 14" aria-hidden="true" className="currency-flag">
          <rect width="20" height="14" rx="2" fill="#ffffff" />
          <rect width="20" height="1.08" y="0" fill="#b91c1c" />
          <rect width="20" height="1.08" y="2.16" fill="#b91c1c" />
          <rect width="20" height="1.08" y="4.32" fill="#b91c1c" />
          <rect width="20" height="1.08" y="6.48" fill="#b91c1c" />
          <rect width="20" height="1.08" y="8.64" fill="#b91c1c" />
          <rect width="20" height="1.08" y="10.8" fill="#b91c1c" />
          <rect width="9" height="7.6" rx="2" fill="#1d4ed8" />
        </svg>
      );
    case "EU":
      return (
        <svg viewBox="0 0 20 14" aria-hidden="true" className="currency-flag">
          <rect width="20" height="14" rx="2" fill="#1d4ed8" />
          <circle cx="10" cy="3.2" r="0.65" fill="#facc15" />
          <circle cx="12.8" cy="4" r="0.65" fill="#facc15" />
          <circle cx="14" cy="7" r="0.65" fill="#facc15" />
          <circle cx="12.8" cy="10" r="0.65" fill="#facc15" />
          <circle cx="10" cy="10.8" r="0.65" fill="#facc15" />
          <circle cx="7.2" cy="10" r="0.65" fill="#facc15" />
          <circle cx="6" cy="7" r="0.65" fill="#facc15" />
          <circle cx="7.2" cy="4" r="0.65" fill="#facc15" />
          <circle cx="8.6" cy="3.6" r="0.55" fill="#facc15" />
          <circle cx="11.4" cy="3.6" r="0.55" fill="#facc15" />
          <circle cx="13.4" cy="5.3" r="0.55" fill="#facc15" />
          <circle cx="13.4" cy="8.7" r="0.55" fill="#facc15" />
        </svg>
      );
    case "GB":
      return (
        <svg viewBox="0 0 20 14" aria-hidden="true" className="currency-flag">
          <rect width="20" height="14" rx="2" fill="#1e3a8a" />
          <path d="M0 1.5L5.5 5.2V0h3v5.2L14.5 0H20v1.8L14.6 5.5H20v3h-5.4L20 12.2V14h-5.5L8.5 9.8V14h-3V9.8L0 14v-1.8l5.4-3.7H0v-3h5.4L0 1.8Z" fill="#ffffff" />
          <path d="M0 2.4L4.2 5.2H6L1.2 2.4ZM18.8 2.4L14 5.2h1.8L20 2.8V2.4ZM0 11.6v.4h.4l5.6-3.8H4.2ZM13.9 8.2l5.7 3.8h.4v-.4l-5.9-3.4Z" fill="#dc2626" />
          <rect x="8" width="4" height="14" fill="#ffffff" />
          <rect y="5" width="20" height="4" fill="#ffffff" />
          <rect x="8.7" width="2.6" height="14" fill="#dc2626" />
          <rect y="5.7" width="20" height="2.6" fill="#dc2626" />
        </svg>
      );
    case "CA":
      return (
        <svg viewBox="0 0 20 14" aria-hidden="true" className="currency-flag">
          <rect width="20" height="14" rx="2" fill="#ffffff" />
          <rect width="4" height="14" fill="#dc2626" />
          <rect x="16" width="4" height="14" fill="#dc2626" />
          <path d="M10 3.2 11.2 5h1.8l-1.4 1.2.4 2-2-1.1-2 1.1.4-2L7 5h1.8ZM9.3 8.1h1.4v2.7H9.3Z" fill="#dc2626" />
        </svg>
      );
    case "AU":
      return (
        <svg viewBox="0 0 20 14" aria-hidden="true" className="currency-flag">
          <rect width="20" height="14" rx="2" fill="#1e3a8a" />
          <circle cx="14.8" cy="4" r="1.1" fill="#ffffff" />
          <circle cx="12.8" cy="7.2" r="0.9" fill="#ffffff" />
          <circle cx="16.4" cy="8.4" r="0.9" fill="#ffffff" />
          <circle cx="14.6" cy="10.8" r="1" fill="#ffffff" />
          <rect width="8" height="5.8" fill="#1e40af" />
          <rect x="3.1" width="1.8" height="5.8" fill="#ffffff" />
          <rect y="2" width="8" height="1.8" fill="#ffffff" />
          <rect x="3.55" width="0.9" height="5.8" fill="#dc2626" />
          <rect y="2.45" width="8" height="0.9" fill="#dc2626" />
        </svg>
      );
    case "CH":
      return (
        <svg viewBox="0 0 20 14" aria-hidden="true" className="currency-flag">
          <rect width="20" height="14" rx="2" fill="#dc2626" />
          <rect x="8" y="2.5" width="4" height="9" fill="#ffffff" />
          <rect x="5.5" y="5" width="9" height="4" fill="#ffffff" />
        </svg>
      );
    case "SG":
      return (
        <svg viewBox="0 0 20 14" aria-hidden="true" className="currency-flag">
          <rect width="20" height="14" rx="2" fill="#ffffff" />
          <path d="M0 0h20v7H0z" fill="#dc2626" />
          <circle cx="5.8" cy="4" r="2.1" fill="#ffffff" />
          <circle cx="6.5" cy="4" r="1.7" fill="#dc2626" />
          <circle cx="8.6" cy="2.7" r="0.35" fill="#ffffff" />
          <circle cx="9.5" cy="3.6" r="0.35" fill="#ffffff" />
          <circle cx="9.1" cy="4.8" r="0.35" fill="#ffffff" />
          <circle cx="7.9" cy="5.4" r="0.35" fill="#ffffff" />
          <circle cx="7.5" cy="4.1" r="0.35" fill="#ffffff" />
        </svg>
      );
    case "AE":
      return (
        <svg viewBox="0 0 20 14" aria-hidden="true" className="currency-flag">
          <rect width="20" height="14" rx="2" fill="#ffffff" />
          <rect width="5" height="14" fill="#dc2626" />
          <rect x="5" width="15" height="4.67" fill="#16a34a" />
          <rect x="5" y="9.33" width="15" height="4.67" fill="#111827" />
        </svg>
      );
    default:
      return null;
  }
};

export const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { cartCount, currency, setCurrency, auth, setAuth, notice, setNotice } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopSettingsOpen, setDesktopSettingsOpen] = useState(false);
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);
  const currentCurrency = supportedCurrencies.find((entry) => entry.code === currency) || supportedCurrencies[0];

  useEffect(() => {
    setMobileMenuOpen(false);
    setDesktopSettingsOpen(false);
    setCurrencyModalOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      setDesktopSettingsOpen(false);
    }
  }, [mobileMenuOpen]);

  const handleLogout = () => {
    setAuth({ token: "", user: null });
    setNotice("You have been signed out.");
    setMobileMenuOpen(false);
    setCurrencyModalOpen(false);
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 border-b" style={{ borderColor: "var(--line)" }}>
      <div className="glass header-surface">
        <div className="navbar container-shell relative flex items-center justify-between gap-4 py-3 md:gap-6 md:py-4">
          <Link to="/" className="logo-container">
            <img src={logo} alt="YourGuyInJapan logo" className="logo-img" />
            <span className="logo-text">
              YourGuyInJapan<span className="logo-domain">.com</span>
            </span>
          </Link>

          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center justify-center gap-8 whitespace-nowrap md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`}
              >
                <span className="nav-link-copy">
                  {item.recommended && (
                    <span className="nav-link-badge">
                      <Sparkles size={10} />
                      <span>Recommended</span>
                    </span>
                  )}
                  <span>{item.label}</span>
                </span>
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2 md:hidden">
            <div className="relative inline-flex pt-3">
              <span className="micro-badge absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">Beta</span>
              <Link
                to="/products#ai-search"
                className="request-btn utility-label utility-label-mobile utility-label-mobile-compact utility-label-accent"
              >
                AI Search ✨
              </Link>
            </div>
          </div>

          <div className="relative z-10 hidden items-center gap-2 md:flex">
            <Link to="/cart" className="utility-cart" aria-label="Cart">
              <ShoppingBag size={16} />
              <span className="ml-2 text-sm font-semibold">{cartCount}</span>
            </Link>
            <div className="relative inline-flex pt-3">
              <span className="micro-badge absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">Beta</span>
              <Link to="/products#ai-search" className="utility-label utility-label-accent">
                AI Search ✨
              </Link>
            </div>
            <button
              type="button"
              className="utility-label"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMobileMenuOpen((current) => !current)}
            >
              {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
              <span className="ml-2">Menu</span>
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="container-shell pb-3 md:hidden">
            <div className="mobile-menu-panel">
              <div className="mobile-menu-links">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `mobile-menu-link ${isActive ? "mobile-menu-link-active" : ""}`}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>

              <div className="mobile-menu-actions">
                <button type="button" className="currency-card" onClick={() => setCurrencyModalOpen(true)}>
                  <div className="currency-card-copy">
                    <span className="currency-card-label">Change Currency</span>
                    <span className="currency-card-value">
                      <CurrencyFlag country={currentCurrency.country} />
                      <span>{currentCurrency.code}</span>
                    </span>
                  </div>
                  <ChevronRight size={16} />
                </button>

                <Link to="/wishlist" className="mobile-menu-button">
                  <Heart size={16} />
                  <span>Wishlist</span>
                </Link>

                <Link to="/cart" className="mobile-menu-button">
                  <ShoppingBag size={16} />
                  <span>Cart {cartCount > 0 ? `(${cartCount})` : ""}</span>
                </Link>

                <Link to={auth.user ? "/orders" : "/auth"} className="mobile-menu-button">
                  <User size={16} />
                  <span>{auth.user ? "Orders" : "Account"}</span>
                </Link>

                {auth.user?.role === "admin" && (
                  <Link to="/admin" className="mobile-menu-button">
                    <span>Admin</span>
                  </Link>
                )}

                {auth.user && (
                  <button type="button" className="mobile-menu-button" onClick={handleLogout}>
                    <span>Logout</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {mobileMenuOpen && (
          <div className="container-shell hidden pb-4 md:block">
            <div className="desktop-menu-panel">
              <div className="desktop-menu-column">
                <p className="desktop-menu-heading">Browse</p>
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `desktop-menu-link ${isActive ? "desktop-menu-link-active" : ""}`}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>

              <div className="desktop-menu-column">
                <p className="desktop-menu-heading">Quick actions</p>
                <div className="desktop-menu-actions">
                  <button
                    type="button"
                    className="desktop-menu-button"
                    onClick={() => setDesktopSettingsOpen((current) => !current)}
                  >
                    <Settings size={16} />
                    <span>Settings</span>
                  </button>

                  <Link to="/wishlist" className="desktop-menu-button">
                    <Heart size={16} />
                    <span>Wishlist</span>
                  </Link>

                  <Link to="/cart" className="desktop-menu-button">
                    <ShoppingBag size={16} />
                    <span>Cart {cartCount > 0 ? `(${cartCount})` : ""}</span>
                  </Link>

                  {desktopSettingsOpen && (
                    <div className="desktop-settings-panel">
                      <button type="button" className="currency-card" onClick={() => setCurrencyModalOpen(true)}>
                        <div className="currency-card-copy">
                          <span className="currency-card-label">Change Currency</span>
                          <span className="currency-card-value">
                            <CurrencyFlag country={currentCurrency.country} />
                            <span>{currentCurrency.code}</span>
                          </span>
                        </div>
                        <ChevronRight size={16} />
                      </button>

                      <Link to={auth.user ? "/orders" : "/auth"} className="desktop-menu-button">
                        <User size={16} />
                        <span>{auth.user ? "Orders" : "Account"}</span>
                      </Link>

                      {auth.user && (
                        <button type="button" className="desktop-menu-button" onClick={handleLogout}>
                          <span>Logout</span>
                        </button>
                      )}
                    </div>
                  )}

                  {auth.user?.role === "admin" && (
                    <Link to="/admin" className="desktop-menu-button">
                      <span>Admin</span>
                    </Link>
                  )}

                </div>
              </div>
            </div>
          </div>
        )}

        {notice && (
          <div className="container-shell pb-3">
            <div className="flex items-center justify-between rounded-[22px] border px-4 py-3 text-sm" style={{ borderColor: "var(--line)" }}>
              <span>{notice}</span>
              <button type="button" className="opacity-60" onClick={() => setNotice("")}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {currencyModalOpen && (
          <div className="currency-modal-backdrop" role="dialog" aria-modal="true" aria-label="Change currency">
            <div className="currency-modal glass">
              <div className="currency-modal-header">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] opacity-60">Currency</p>
                  <h2 className="mt-2 text-2xl font-semibold">Change Currency</h2>
                </div>
                <button
                  type="button"
                  className="utility-icon"
                  aria-label="Close currency modal"
                  onClick={() => setCurrencyModalOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="currency-modal-grid">
                {supportedCurrencies.map((entry) => (
                  <button
                    key={entry.code}
                    type="button"
                    className={`currency-option ${currency === entry.code ? "currency-option-active" : ""}`}
                    onClick={() => {
                      setCurrency(entry.code);
                      setCurrencyModalOpen(false);
                    }}
                    aria-pressed={currency === entry.code}
                  >
                    <CurrencyFlag country={entry.country} />
                    <span>{entry.code}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
