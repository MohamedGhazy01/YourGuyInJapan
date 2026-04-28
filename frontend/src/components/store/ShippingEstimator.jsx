import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { useApp } from "../../context/AppProvider";
import { convertFromJPY, formatMoney } from "../../utils/format";

const countryOptions = [
  { code: "US", label: "United States" },
  { code: "CA", label: "Canada" },
  { code: "GB", label: "United Kingdom" },
  { code: "AU", label: "Australia" },
  { code: "SG", label: "Singapore" },
  { code: "FR", label: "France" }
];

const methodMeta = {
  standard: {
    label: "Standard",
    eta: "Estimated 6-10 business days"
  },
  express: {
    label: "Express",
    eta: "Estimated 2-4 business days"
  }
};

const blankManualForm = {
  weightKg: "",
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  sizePreset: "medium"
};

const sizePresetMeta = {
  small: {
    label: "Small box",
    description: "Trading cards / small goods",
    dimensions: { lengthCm: "24", widthCm: "18", heightCm: "6" }
  },
  medium: {
    label: "Medium box",
    description: "Figures / clothes",
    dimensions: { lengthCm: "36", widthCm: "26", heightCm: "12" }
  },
  large: {
    label: "Large box",
    description: "Shoes / bigger items",
    dimensions: { lengthCm: "46", widthCm: "34", heightCm: "18" }
  },
  custom: {
    label: "Custom size",
    description: "Enter your own package dimensions",
    dimensions: { lengthCm: "", widthCm: "", heightCm: "" }
  }
};

const normalizeCartItems = (cartItems = [], fallbackItemCount = 1) => {
  if (Array.isArray(cartItems) && cartItems.length) {
    return cartItems.map((item) => ({
      title: item.title,
      category: item.category,
      quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
      weightKg: item.weightKg,
      packageDimensionsCm: item.packageDimensionsCm,
      lengthCm: item.lengthCm,
      widthCm: item.widthCm,
      heightCm: item.heightCm
    }));
  }

  const safeCount = Math.max(0, Math.floor(Number(fallbackItemCount) || 0));
  return Array.from({ length: safeCount }, () => ({ quantity: 1 }));
};

const sanitizeMeasurementInput = (value) => {
  const text = String(value ?? "");
  if (!text) return "";
  if (!/^\d*\.?\d*$/.test(text)) return text.slice(0, -1);
  return text;
};

const buildPriceText = (option, currency) => {
  if (!option) {
    return {
      primary: "Shipping estimate to be confirmed.",
      secondary: ""
    };
  }

  if (option.isRange && option.minShippingJPY != null && option.maxShippingJPY != null) {
    return {
      primary: `${formatMoney(convertFromJPY(option.minShippingJPY, currency), currency)}-${formatMoney(
        convertFromJPY(option.maxShippingJPY, currency),
        currency
      )}`,
      secondary: `JPY ${Number(option.minShippingJPY).toLocaleString()}-JPY ${Number(option.maxShippingJPY).toLocaleString()}`
    };
  }

  if (option.shippingJPY != null) {
    return {
      primary: formatMoney(convertFromJPY(option.shippingJPY, currency), currency),
      secondary: `JPY ${Number(option.shippingJPY).toLocaleString()}`
    };
  }

  return {
    primary: "Shipping estimate to be confirmed.",
    secondary: ""
  };
};

export const ShippingEstimator = ({ itemCount = 1, cartItems = [], autoEstimate = false, onEstimate }) => {
  const { currency } = useApp();
  const [mode, setMode] = useState("cart");
  const [country, setCountry] = useState("US");
  const [deliveryPreference, setDeliveryPreference] = useState("standard");
  const [manualForm, setManualForm] = useState(blankManualForm);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const normalizedCartItems = useMemo(
    () => normalizeCartItems(cartItems, itemCount),
    [cartItems, itemCount]
  );

  useEffect(() => {
    const selected = result?.methods?.[deliveryPreference];
    if (!selected || selected.isRange || selected.shippingJPY == null) return;
    onEstimate?.(selected.shippingJPY);
  }, [deliveryPreference, onEstimate, result]);

  useEffect(() => {
    setResult(null);
    setError("");
  }, [mode]);

  const applySizePreset = (presetKey) => {
    const preset = sizePresetMeta[presetKey] || sizePresetMeta.medium;
    setManualForm((current) => ({
      ...current,
      sizePreset: presetKey,
      ...(presetKey === "custom"
        ? {}
        : {
            lengthCm: preset.dimensions.lengthCm,
            widthCm: preset.dimensions.widthCm,
            heightCm: preset.dimensions.heightCm
          })
    }));
  };

  const requestEstimate = async (nextMode = mode) => {
    if (loading) return;
    setError("");
    setLoading(true);

    try {
      const payload =
        nextMode === "manual"
          ? {
            mode: "manual",
            destinationCountry: country,
            deliveryPreference,
            weightKg: Number(manualForm.weightKg),
            lengthCm: Number(manualForm.lengthCm),
            widthCm: Number(manualForm.widthCm),
            heightCm: Number(manualForm.heightCm)
          }
          : {
            mode: "cart",
            destinationCountry: country,
            deliveryPreference,
            cartItems: normalizedCartItems
          };

      const response = await api.post("/orders/estimate-shipping", payload);
      setResult(response.data || null);
    } catch (err) {
      setResult(null);
      setError(err.response?.data?.message || "Shipping estimate unavailable right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!autoEstimate || mode !== "cart") return;
    requestEstimate("cart");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEstimate, country, normalizedCartItems]);

  const helperText =
    mode === "cart"
      ? "Estimated from selected cart items"
      : "Enter package size and weight for a manual estimate.";

  const selectedMethodOption = result?.methods?.[deliveryPreference] || null;
  const selectedPriceText = buildPriceText(selectedMethodOption, currency);
  const selectedPreset = sizePresetMeta[manualForm.sizePreset] || sizePresetMeta.medium;
  const displayDimensions =
    manualForm.sizePreset === "custom"
      ? [manualForm.lengthCm, manualForm.widthCm, manualForm.heightCm].every(Boolean)
        ? `${manualForm.lengthCm} x ${manualForm.widthCm} x ${manualForm.heightCm} cm`
        : "To be confirmed"
      : `${manualForm.lengthCm || selectedPreset.dimensions.lengthCm} x ${manualForm.widthCm || selectedPreset.dimensions.widthCm} x ${
          manualForm.heightCm || selectedPreset.dimensions.heightCm
        } cm`;
  const destinationLabel =
    countryOptions.find((entry) => entry.code === country)?.label || country;

  return (
    <div className="glass rounded-[28px] p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-lg font-semibold">Estimated shipping preview</p>
          <p className="mt-1 text-sm opacity-70">{helperText}</p>
        </div>
        <button type="button" className="btn-primary w-full md:w-auto" onClick={() => requestEstimate()} disabled={loading}>
          {loading ? "Estimating..." : "Estimate shipping"}
        </button>
      </div>

      <div className="mt-5 inline-flex rounded-full border p-1" style={{ borderColor: "var(--line)", background: "rgba(255,250,246,0.75)" }}>
        {[
          { key: "cart", label: "From cart" },
          { key: "manual", label: "Manual package" }
        ].map((entry) => {
          const active = mode === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              className="rounded-full px-4 py-2 text-sm font-medium transition"
              style={{
                background: active ? "var(--accent-soft)" : "transparent",
                color: active ? "var(--accent)" : "var(--fg)"
              }}
              onClick={() => setMode(entry.key)}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      {mode === "cart" && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <label>
            <span className="mb-2 block text-sm opacity-70">Destination</span>
            <select className="input" value={country} onChange={(event) => setCountry(event.target.value)}>
              {countryOptions.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-2 block text-sm opacity-70">Preferred delivery</span>
            <select className="input" value={deliveryPreference} onChange={(event) => setDeliveryPreference(event.target.value)}>
              <option value="standard">Standard</option>
              <option value="express">Express</option>
            </select>
          </label>
        </div>
      )}

      {mode === "manual" && (
        <div className="mt-5 space-y-5">
          <div className="rounded-[24px] border p-4" style={{ borderColor: "var(--line)", background: "rgba(255,250,246,0.7)" }}>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] opacity-60">1. Destination country</p>
            <p className="mt-2 text-sm opacity-70">Choose where the parcel will be delivered.</p>
            <div className="mt-4">
              <select className="input" value={country} onChange={(event) => setCountry(event.target.value)}>
                {countryOptions.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-[24px] border p-4" style={{ borderColor: "var(--line)", background: "rgba(255,250,246,0.7)" }}>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] opacity-60">2. Package weight</p>
            <p className="mt-2 text-sm opacity-70">Enter the packed weight if you know it.</p>
            <div className="mt-4">
              <label>
                <span className="mb-2 block text-sm opacity-70">Weight (kg)</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.1"
                  value={manualForm.weightKg}
                  onChange={(event) =>
                    setManualForm((current) => ({
                      ...current,
                      weightKg: sanitizeMeasurementInput(event.target.value)
                    }))
                  }
                />
              </label>
            </div>
          </div>

          <div className="rounded-[24px] border p-4" style={{ borderColor: "var(--line)", background: "rgba(255,250,246,0.7)" }}>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] opacity-60">3. Package size</p>
            <p className="mt-2 text-sm opacity-70">Choose a box size first, or switch to custom dimensions.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {Object.entries(sizePresetMeta).map(([presetKey, preset]) => {
                const active = manualForm.sizePreset === presetKey;
                return (
                  <button
                    key={presetKey}
                    type="button"
                    className="rounded-[22px] border p-4 text-left transition"
                    style={{
                      borderColor: active ? "var(--accent)" : "var(--line)",
                      background: active ? "var(--accent-soft)" : "rgba(255,255,255,0.76)"
                    }}
                    onClick={() => applySizePreset(presetKey)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{preset.label}</p>
                        <p className="mt-1 text-sm opacity-70">{preset.description}</p>
                      </div>
                      {active && (
                        <span
                          className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                          style={{ background: "rgba(180, 85, 99, 0.12)", color: "var(--accent)" }}
                        >
                          Selected
                        </span>
                      )}
                    </div>
                    {presetKey !== "custom" && (
                      <p className="mt-3 text-sm opacity-65">
                        {preset.dimensions.lengthCm} x {preset.dimensions.widthCm} x {preset.dimensions.heightCm} cm
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            {manualForm.sizePreset === "custom" && (
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <label>
                  <span className="mb-2 block text-sm opacity-70">Length (cm)</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="1"
                    value={manualForm.lengthCm}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        lengthCm: sanitizeMeasurementInput(event.target.value)
                      }))
                    }
                  />
                </label>
                <label>
                  <span className="mb-2 block text-sm opacity-70">Width (cm)</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="1"
                    value={manualForm.widthCm}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        widthCm: sanitizeMeasurementInput(event.target.value)
                      }))
                    }
                  />
                </label>
                <label>
                  <span className="mb-2 block text-sm opacity-70">Height (cm)</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="1"
                    value={manualForm.heightCm}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        heightCm: sanitizeMeasurementInput(event.target.value)
                      }))
                    }
                  />
                </label>
              </div>
            )}
          </div>

          <div className="rounded-[24px] border p-4" style={{ borderColor: "var(--line)", background: "rgba(255,250,246,0.7)" }}>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] opacity-60">4. Delivery speed</p>
            <p className="mt-2 text-sm opacity-70">Choose the shipping speed you want to compare.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {Object.entries(methodMeta).map(([entryMethod, meta]) => {
                const active = deliveryPreference === entryMethod;
                return (
                  <button
                    key={entryMethod}
                    type="button"
                    className="rounded-[22px] border p-4 text-left transition"
                    style={{
                      borderColor: active ? "var(--accent)" : "var(--line)",
                      background: active ? "var(--accent-soft)" : "rgba(255,255,255,0.76)"
                    }}
                    onClick={() => setDeliveryPreference(entryMethod)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{meta.label}</p>
                      {active && (
                        <span
                          className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                          style={{ background: "rgba(180, 85, 99, 0.12)", color: "var(--accent)" }}
                        >
                          Selected
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm opacity-70">{meta.eta}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <p className="mt-4 text-sm opacity-65">
        Size and weight are estimates. Final shipping may change after consolidation and packing.
      </p>

      {result && (
        <>
          <div className="mt-5 rounded-[22px] border px-4 py-3 text-sm opacity-75" style={{ borderColor: "var(--line)" }}>
            <p className="font-medium">{result.previewLabel || "Estimated shipping preview"}</p>
            <p className="mt-1">{result.rateTableLabel || "Based on current internal rate table"}</p>
            <p className="mt-1">{result.basisLabel || "Estimated from selected cart items"}</p>
            <p className="mt-1">{result.confirmationLabel || "Final shipping cost confirmed after warehouse packing."}</p>
          </div>

          {mode === "manual" && (
            <div
              className="mt-5 rounded-[24px] border p-5"
              style={{ borderColor: "var(--line)", background: "rgba(255,250,246,0.78)" }}
            >
              <p className="text-base font-semibold">Estimate summary</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {[
                  ["Destination", destinationLabel],
                  ["Package weight", manualForm.weightKg ? `${manualForm.weightKg} kg` : "To be confirmed"],
                  ["Package size", displayDimensions],
                  ["Delivery method", methodMeta[deliveryPreference]?.label || "Standard"],
                  ["Estimated shipping", selectedPriceText.primary]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[18px] border px-4 py-3" style={{ borderColor: "var(--line)" }}>
                    <p className="text-xs uppercase tracking-[0.2em] opacity-55">{label}</p>
                    <p className="mt-2 font-medium">{value}</p>
                    {label === "Estimated shipping" && selectedPriceText.secondary && (
                      <p className="mt-1 text-sm opacity-65">{selectedPriceText.secondary}</p>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm opacity-65">Final shipping cost confirmed after warehouse packing.</p>
              <p className="mt-1 text-sm opacity-60">Based on current internal rate table</p>
            </div>
          )}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {Object.entries(methodMeta).map(([entryMethod, meta]) => {
              const option = result?.methods?.[entryMethod];
              const active = deliveryPreference === entryMethod;
              const priceText = buildPriceText(option, currency);

              return (
                <button
                  key={entryMethod}
                  type="button"
                  className="rounded-[24px] border p-5 text-left transition"
                  style={{
                    borderColor: active ? "var(--accent)" : "var(--line)",
                    background: active ? "var(--accent-soft)" : "rgba(255, 250, 246, 0.78)"
                  }}
                  onClick={() => setDeliveryPreference(entryMethod)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-base font-semibold">{meta.label}</p>
                    {active && (
                      <span
                        className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                        style={{ background: "rgba(180, 85, 99, 0.12)", color: "var(--accent)" }}
                      >
                        Selected
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-2xl font-semibold">{priceText.primary}</p>
                  <p className="mt-2 text-sm opacity-70">{priceText.secondary || "Shipping estimate to be confirmed."}</p>
                  <p className="mt-3 text-sm opacity-65">{meta.eta}</p>
                </button>
              );
            })}
          </div>
        </>
      )}

      {!result && !error && (
        <p className="mt-5 text-sm opacity-65">
          Based on current internal rate table. Final shipping cost confirmed after warehouse packing.
        </p>
      )}

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
    </div>
  );
};
