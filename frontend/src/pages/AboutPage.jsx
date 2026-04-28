import { motion } from "framer-motion";

const aboutCards = [
  "We source unique products directly from Japan, from everyday essentials to limited finds.",
  "We handle verification, coordination, and shipping so your experience stays simple and transparent.",
  "We deliver a smooth, reliable shopping experience with real human support behind every order."
];

export const AboutPage = () => (
  <section className="container-shell py-14 md:py-20">
    <div className="relative overflow-hidden rounded-[36px] border border-white/22 shadow-[0_28px_70px_rgba(39,24,15,0.12)] md:rounded-[44px]">
      <motion.div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage: "url('/about-team.png')",
          backgroundSize: "cover",
          backgroundPosition: "top center",
          backgroundRepeat: "no-repeat",
          filter: "brightness(1.1) contrast(1.08) saturate(1.02)"
        }}
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 18, ease: "easeInOut", repeat: Infinity }}
      />

      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.2), rgba(0,0,0,0.1))"
        }}
      />

      <div
        className="relative z-10 flex min-h-[520px] flex-col p-8 text-left text-white md:min-h-[600px] md:p-14"
        style={{ textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}
      >
        <p className="text-sm uppercase tracking-[0.3em] text-white/70">About us</p>
        <h1 className="section-title mt-3 max-w-3xl text-white">Your trusted guy in Japan</h1>
        <p className="mt-6 max-w-[65ch] text-base leading-7 text-white/88 md:text-lg md:leading-8">
          YourGuyInJapan.com is built for customers who want authentic products from Japan without
          the friction of language barriers, regional checkouts, or shipping complexity. We act as a
          premium proxy buying service: sourcing items locally, verifying quality, consolidating
          packages, and shipping globally with clear tracking and support.
        </p>

        <div className="mt-auto pt-14 grid gap-6 md:grid-cols-3 md:gap-8">
          {aboutCards.map((text) => (
            <div
              key={text}
              className="rounded-[28px] border p-6 text-white/95 shadow-[0_14px_30px_rgba(0,0,0,0.12)] backdrop-blur-[6px]"
              style={{
                background: "linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,245,247,0.14))",
                borderColor: "rgba(255,255,255,0.2)"
              }}
            >
              {text}
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);
