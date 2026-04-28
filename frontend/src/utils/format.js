export const formatMoney = (value, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value || 0));

export const starArray = (count = 5) => Array.from({ length: count }, (_, index) => index + 1);

const exchangeRates = {
  JPY: 1,
  USD: 0.0066,
  EUR: 0.0061,
  GBP: 0.0052,
  CAD: 0.0091,
  AUD: 0.0103,
  CHF: 0.0059,
  SGD: 0.0087,
  AED: 0.0242
};

export const supportedCurrencies = [
  { code: "JPY", country: "JP" },
  { code: "USD", country: "US" },
  { code: "EUR", country: "EU" },
  { code: "GBP", country: "GB" },
  { code: "CAD", country: "CA" },
  { code: "AUD", country: "AU" },
  { code: "CHF", country: "CH" },
  { code: "SGD", country: "SG" },
  { code: "AED", country: "AE" }
];

export const convertFromJPY = (value, currency = "USD") =>
  Number(value || 0) * (exchangeRates[currency] || exchangeRates.USD);

export const mediaUrl = (media) => {
  const raw = media?.url;
  if (!raw) return "";
  return raw.startsWith("/uploads")
    ? `${import.meta.env.VITE_ASSET_URL || "http://localhost:5000"}${raw}`
    : raw;
};

export const fallbackMediaUrl = (media) => {
  if (media?.alt?.toLowerCase().includes("keyboard")) {
    return "/seed-keyboard.svg";
  }

  return "data:image/svg+xml;utf8," + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900">
      <rect width="1200" height="900" fill="#17171b"/>
      <rect x="80" y="80" width="1040" height="740" rx="40" fill="#202028"/>
      <text x="600" y="430" text-anchor="middle" font-family="Arial, sans-serif" font-size="54" fill="#f2f2f2">
        Product image unavailable
      </text>
    </svg>
  `);
};
