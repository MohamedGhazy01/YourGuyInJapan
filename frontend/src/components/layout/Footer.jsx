import { Link } from "react-router-dom";

export const Footer = () => (
  <footer className="mt-24 border-t py-12 md:mt-28 md:py-14" style={{ borderColor: "var(--line)" }}>
    <div
      className="container-shell rounded-[32px] border px-6 py-8 md:px-10 md:py-10"
      style={{
        borderColor: "var(--line)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.74), rgba(255,248,244,0.92))",
        boxShadow: "0 18px 48px rgba(108, 73, 57, 0.06)"
      }}
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-lg font-semibold">
          YourGuyInJapan<span style={{ color: "var(--accent)" }}>.com</span>
        </p>
        <p className="mt-2 max-w-md text-sm opacity-70">
          Premium proxy buying and worldwide shipping for carefully selected goods from Japan.
        </p>
      </div>
      <div className="flex flex-wrap gap-4 text-sm opacity-80">
        <Link to="/products">Shop</Link>
        <Link to="/about">About</Link>
        <Link to="/track-order">Track Order</Link>
        <Link to="/auth">Account</Link>
      </div>
      </div>
    </div>
  </footer>
);
