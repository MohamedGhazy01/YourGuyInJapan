import { motion } from "framer-motion";
import { PackageSearch, Search, Sparkles, Tags } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import aiThinkingMascot from "../../assets/ai-thinking-mascot.png";

const thinkingMessages = [
  "Searching across Japan...",
  "Comparing prices and availability...",
  "Finding the best deals for you..."
];

const progressSteps = [
  { label: "Searching marketplaces", icon: Search },
  { label: "Comparing prices", icon: Tags },
  { label: "Checking availability", icon: PackageSearch }
];

export const AIThinkingWidget = ({ active = false, onCancel }) => {
  const [step, setStep] = useState(0);
  const [showCancel, setShowCancel] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    if (!active) {
      setStep(0);
      setShowCancel(false);
      setConfirmCancel(false);
      return undefined;
    }

    setStep(0);
    setShowCancel(false);
    setConfirmCancel(false);
    const secondStepTimeout = window.setTimeout(() => setStep(1), 1500);
    const thirdStepTimeout = window.setTimeout(() => setStep(2), 3000);
    const cancelTimeout = window.setTimeout(() => setShowCancel(true), 8000);

    return () => {
      window.clearTimeout(secondStepTimeout);
      window.clearTimeout(thirdStepTimeout);
      window.clearTimeout(cancelTimeout);
    };
  }, [active]);

  const message = useMemo(() => thinkingMessages[Math.min(step, thinkingMessages.length - 1)], [step]);

  const handleCancelClick = () => {
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }

    if (typeof onCancel === "function") {
      onCancel();
    }
  };

  if (!active) return null;

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-center justify-center px-4 py-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <motion.div
        className="w-[min(430px,calc(100vw-2rem))] overflow-hidden rounded-[30px] border p-6 shadow-[0_26px_72px_rgba(37,26,27,0.14)] backdrop-blur"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.98 }}
        transition={{ duration: 0.26, ease: "easeOut" }}
        style={{
          borderColor: "rgba(231, 181, 191, 0.85)",
          background:
            "radial-gradient(circle at top, rgba(255,255,255,0.98), rgba(255,247,244,0.96) 72%, rgba(251,237,233,0.94))"
        }}
      >
        <div className="relative flex flex-col items-center text-center">
          {[
            { className: "left-[16%] top-8", delay: 0, size: 16 },
            { className: "right-[16%] top-7", delay: 0.2, size: 14 },
            { className: "right-[23%] top-16", delay: 0.35, size: 12 },
            { className: "left-[24%] top-[86px]", delay: 0.48, size: 12 }
          ].map((sparkle, index) => (
            <motion.span
              key={index}
              className={`absolute ${sparkle.className}`}
              animate={{ opacity: [0.2, 0.9, 0.2], y: [0, -4, 0], scale: [0.9, 1.08, 0.9] }}
              transition={{
                duration: 1.8,
                repeat: Number.POSITIVE_INFINITY,
                delay: sparkle.delay,
                ease: "easeInOut"
              }}
            >
              <Sparkles size={sparkle.size} color="rgba(221, 118, 145, 0.72)" strokeWidth={2.1} />
            </motion.span>
          ))}

          <motion.div
            className="relative mb-3 mt-1"
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
          >
            <div className="relative mx-auto w-[190px]">
              <div
                className="absolute inset-x-5 bottom-3 h-10 rounded-full blur-2xl"
                style={{ background: "radial-gradient(circle, rgba(241,169,188,0.38), transparent 72%)" }}
              />
              <img src={aiThinkingMascot} alt="" className="relative z-[1] w-full drop-shadow-[0_14px_24px_rgba(225,154,176,0.18)]" />
            </div>
          </motion.div>

          <p className="text-[clamp(1.5rem,2.3vw,2rem)] font-semibold leading-tight text-[color:var(--fg)]">{message}</p>

          <div className="mt-5 flex items-center justify-center gap-2">
            {[0, 1, 2].map((dot) => (
              <motion.span
                key={dot}
                className="h-3.5 w-3.5 rounded-full"
                style={{ background: dot <= step ? "var(--accent)" : "rgba(226, 183, 194, 0.72)" }}
                animate={{ opacity: dot === step ? [0.48, 1, 0.48] : 1, y: dot === step ? [0, -3, 0] : 0 }}
                transition={{
                  duration: 0.95,
                  repeat: dot === step ? Number.POSITIVE_INFINITY : 0,
                  repeatType: "loop",
                  ease: "easeInOut"
                }}
              />
            ))}
          </div>

          <div className="mt-6 h-px w-full bg-[rgba(219,202,197,0.7)]" />

          <div className="mt-5 grid w-full grid-cols-3 gap-2 sm:gap-3">
            {progressSteps.map((item, index) => {
              const Icon = item.icon;
              const activeStep = index <= step;

              return (
                <div
                  key={item.label}
                  className="flex min-w-0 flex-col items-center gap-2 rounded-[18px] px-2 py-2 text-center"
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: activeStep ? "rgba(240, 137, 160, 0.16)" : "rgba(255,255,255,0.74)",
                      color: activeStep ? "var(--accent)" : "rgba(108, 94, 93, 0.78)"
                    }}
                  >
                    <Icon size={18} />
                  </div>
                  <p className="text-[12px] leading-4 text-[color:var(--fg)] opacity-80 sm:text-[13px]">
                    {item.label}
                  </p>
                </div>
              );
            })}
          </div>

          {showCancel && typeof onCancel === "function" && (
            <motion.button
              type="button"
              className="pointer-events-auto mt-5 rounded-full border px-5 py-2.5 text-sm font-medium transition"
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: confirmCancel ? [1, 0.96, 1.02, 1] : 1
              }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              style={{
                borderColor: confirmCancel ? "rgba(223, 91, 112, 0.92)" : "rgba(225, 187, 195, 0.9)",
                background: confirmCancel ? "rgba(223, 91, 112, 0.14)" : "rgba(255,255,255,0.8)",
                color: confirmCancel ? "#c53b55" : "var(--fg)"
              }}
              onClick={handleCancelClick}
            >
              {confirmCancel ? "Sure ?" : "Cancel search"}
            </motion.button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
