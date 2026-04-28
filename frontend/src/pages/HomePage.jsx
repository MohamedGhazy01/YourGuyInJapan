import { motion } from "framer-motion";
import { ArrowRight, Globe, Link2, PackageCheck, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ProductCard } from "../components/ui/ProductCard";
import { LoadingGrid } from "../components/ui/LoadingGrid";
import { useApp } from "../context/AppProvider";
import api from "../services/api";

const badges = ["Authentic Japanese goods", "Worldwide tracked shipping", "Human sourcing support"];

const sectionSurfaceStyle = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.78), rgba(255,248,244,0.92))",
  borderColor: "color-mix(in srgb, var(--line) 150%, transparent)",
  boxShadow: "0 24px 60px rgba(108, 73, 57, 0.08)"
};

const sectionDividerStyle = {
  borderTopColor: "color-mix(in srgb, var(--line) 160%, transparent)"
};

const softCardStyle = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.62), rgba(255,246,242,0.86))",
  borderColor: "color-mix(in srgb, var(--line) 145%, transparent)"
};

export const HomePage = () => {
  const { currency } = useApp();
  const [featured, setFeatured] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    api
      .get("/products/featured", { params: { currency } })
      .then((response) => {
        setFeatured(response.data);
      })
      .catch(() => {
        setError("Featured products are unavailable right now.");
      })
      .finally(() => setLoading(false));
  }, [currency]);

  return (
    <>
      <Helmet>
        <title>YourGuyInJapan.com | Premium Japanese Shopping</title>
      </Helmet>

      <section className="container-shell pt-12 md:pt-20">
        <div
          className="glass grid overflow-hidden rounded-[44px] border md:grid-cols-[1.15fr_0.85fr]"
          style={{
            ...sectionSurfaceStyle,
            background:
              "radial-gradient(circle at top right, rgba(245, 218, 226, 0.72), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.8), rgba(255,247,243,0.94))"
          }}
        >
          <div className="p-10 md:p-16">
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 inline-flex rounded-full px-4 py-2 text-xs uppercase tracking-[0.3em]"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              Concierge shopping from Japan
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-3xl text-4xl font-semibold tracking-tight md:text-7xl"
            >
              From Japan to the world.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 max-w-2xl text-base opacity-75 md:text-lg"
            >
              We source and deliver authentic products from Japan with care.
            </motion.p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link to="/products" className="btn-primary min-w-[220px] px-8 py-4 text-base sm:w-auto w-full">
                Shop Collection <ArrowRight className="ml-2" size={16} />
              </Link>
              <Link to="/request" className="btn-secondary min-w-[220px] px-8 py-4 text-base sm:w-auto w-full">
                Request an Item
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-3 text-sm opacity-75">
              {badges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border px-4 py-2"
                  style={{
                    borderColor: "var(--line)",
                    background: "rgba(255,255,255,0.46)"
                  }}
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>
          <div className="grid gap-8 p-10 md:p-16">
            <div
              className="relative overflow-hidden rounded-[36px] border px-8 py-10"
              style={{
                ...softCardStyle,
                background:
                  "linear-gradient(180deg, rgba(255, 250, 248, 0.96), rgba(249, 241, 237, 0.92))"
              }}
            >
              <div className="absolute right-8 top-8 h-5 w-5 rounded-full bg-[rgba(217,114,131,0.9)]" />
              <div className="absolute right-5 top-16 h-2.5 w-2.5 rounded-full bg-[rgba(228,182,192,0.85)]" />
              <div className="absolute bottom-8 left-1/2 h-28 w-40 -translate-x-1/2 rounded-t-[999px] bg-[rgba(122,140,156,0.18)]" />
              <div
                className="absolute bottom-8 left-1/2 h-24 w-40 -translate-x-1/2 bg-[rgba(122,140,156,0.86)]"
                style={{ clipPath: "polygon(50% 0, 100% 100%, 0 100%)" }}
              />
              <div
                className="absolute bottom-[6.1rem] left-1/2 h-8 w-16 -translate-x-1/2 bg-white/90"
                style={{ clipPath: "polygon(50% 0, 100% 100%, 0 100%)" }}
              />
              <div className="relative z-10 max-w-[12rem]">
                <p className="text-xs uppercase tracking-[0.26em] opacity-55">Japan-inspired</p>
                <p className="mt-3 text-2xl font-semibold">Simple sourcing, calm delivery.</p>
              </div>
            </div>

            {[
              { icon: Globe, label: "Global delivery", text: "Door-to-door shipping to major regions." },
              { icon: PackageCheck, label: "Handled with care", text: "Packaging and inspection before dispatch." },
              { icon: ShieldCheck, label: "Trusted checkout", text: "Secure accounts, verified support." }
            ].map(({ icon: Icon, label, text }) => (
              <div key={label} className="rounded-[28px] border p-6" style={softCardStyle}>
                <Icon size={20} style={{ color: "var(--accent)" }} />
                <p className="mt-4 text-lg font-semibold">{label}</p>
                <p className="mt-2 text-sm opacity-70">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-shell mt-24 md:mt-28">
        <div
          className="glass overflow-hidden rounded-[40px] border"
          style={sectionSurfaceStyle}
        >
          <div className="grid gap-10 p-10 md:grid-cols-[1.05fr_0.95fr] md:p-16">
            <div>
              <p
                className="inline-flex rounded-full px-4 py-2 text-xs uppercase tracking-[0.3em]"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                Can&apos;t find it in the catalog?
              </p>
              <h2 className="section-title mt-4 max-w-3xl">
                Send us the product link and request an item from Japan directly.
              </h2>
              <p className="mt-4 max-w-2xl opacity-75">
                If you already found the Japanese item you want, paste the link into our request
                form and our team will review it for sourcing. It&apos;s a core part of the buying
                flow, not a hidden support workaround.
              </p>
              <div className="mt-6 flex flex-col gap-4 sm:flex-row">
                <Link to="/request" className="btn-primary min-w-[220px] px-8 py-4 text-base sm:w-auto w-full">
                  Start a request <ArrowRight className="ml-2" size={16} />
                </Link>
                <Link to="/products" className="btn-secondary min-w-[220px] px-8 py-4 text-base sm:w-auto w-full">
                  Browse ready-to-buy items
                </Link>
              </div>
            </div>
            <div className="grid gap-8">
              {[
                {
                  title: "1. Paste the product link",
                  text: "Drop in the Japanese product URL you want us to review.",
                  icon: Link2
                },
                {
                  title: "2. We review the request",
                  text: "Our admin team checks the request and updates the status clearly.",
                  icon: PackageCheck
                },
                {
                  title: "3. Continue from there",
                  text: "Approved requests stay visible in your account flow while we prepare future product handling.",
                  icon: ShieldCheck
                }
              ].map(({ title, text, icon: Icon }) => (
                <div key={title} className="rounded-[28px] border p-6" style={softCardStyle}>
                  <Icon size={20} style={{ color: "var(--accent)" }} />
                  <p className="mt-4 text-lg font-semibold">{title}</p>
                  <p className="mt-2 text-sm opacity-70">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        className="container-shell mt-24 rounded-[40px] border px-8 py-10 md:mt-28 md:px-10 md:py-14"
        style={{
          ...sectionSurfaceStyle,
          background:
            "radial-gradient(circle at 8% 12%, rgba(243, 217, 224, 0.42), transparent 18%), linear-gradient(180deg, rgba(255,255,255,0.76), rgba(255,248,244,0.92))"
        }}
      >
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] opacity-60">Featured products</p>
            <h2 className="section-title mt-3">Handpicked highlights</h2>
          </div>
          <Link to="/products" className="btn-secondary sm:w-auto w-full">
            See all
          </Link>
        </div>
        {error && (
          <div className="mb-6 rounded-[24px] border px-4 py-3 text-sm text-red-500" style={{ borderColor: "var(--line)" }}>
            {error}
          </div>
        )}
        {loading ? (
          <LoadingGrid />
        ) : (
          <div className="grid-auto">{featured.map((product) => <ProductCard key={product._id} product={product} />)}</div>
        )}
      </section>

      <section
        className="container-shell mt-24 border-t pt-20 md:mt-28 md:pt-24"
        style={sectionDividerStyle}
      >
        <div className="grid gap-8 md:grid-cols-3">
        {[
          { step: "01", title: "Buy from Japan", text: "Share the item you want or shop our ready-to-buy catalog." },
          { step: "02", title: "We secure it", text: "We source, inspect, and consolidate your Japanese purchases." },
          { step: "03", title: "We ship worldwide", text: "Choose a delivery speed and track your parcel to your door." }
        ].map((item) => (
          <div
            key={item.step}
            className="glass rounded-[32px] border p-10 md:p-12"
            style={{
              ...softCardStyle,
              boxShadow: "0 16px 36px rgba(108, 73, 57, 0.05)"
            }}
          >
            <p className="text-sm opacity-50">{item.step}</p>
            <h3 className="mt-2 text-[1.7rem] font-semibold leading-tight md:mt-4 md:text-2xl">
              {item.title}
            </h3>
            <p className="mt-2 text-sm opacity-70 md:mt-3 md:text-base">{item.text}</p>
          </div>
        ))}
        </div>
      </section>

      <section
        className="container-shell mt-24 border-t pt-20 md:mt-28 md:pt-24"
        style={sectionDividerStyle}
      >
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div
          className="glass rounded-[36px] border p-10 md:p-14"
          style={sectionSurfaceStyle}
        >
          <p className="text-sm uppercase tracking-[0.3em] opacity-60">Testimonials</p>
          <h2 className="section-title mt-3">Buyers trust the process</h2>
          <div className="mt-8 grid gap-8">
            {[
              "Everything arrived beautifully packed and exactly as described.",
              "The concierge-style support made buying rare Japanese items surprisingly easy.",
              "Fast updates, great communication, and a premium feel from end to end."
            ].map((quote) => (
              <div key={quote} className="rounded-[28px] border p-6" style={softCardStyle}>
                <Sparkles size={18} style={{ color: "var(--accent)" }} />
                <p className="mt-3 text-lg">{quote}</p>
              </div>
            ))}
          </div>
        </div>
        <div
          className="glass rounded-[36px] border p-10 md:p-14"
          style={sectionSurfaceStyle}
        >
          <p className="text-sm uppercase tracking-[0.3em] opacity-60">Trust badges</p>
          <div className="mt-8 space-y-8">
            {["Secure checkout", "Order tracking", "Responsive support", "Proxy buying expertise"].map((label) => (
              <div key={label} className="flex items-center justify-between rounded-[24px] border px-6 py-5" style={softCardStyle}>
                <span>{label}</span>
                <ShieldCheck size={18} style={{ color: "var(--accent)" }} />
              </div>
            ))}
          </div>
        </div>
        </div>
      </section>
    </>
  );
};
