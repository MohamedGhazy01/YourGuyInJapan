// Internal shipping preview rate table.
// Update these values when carrier pricing changes.

export const SHIPPING_RATE_TABLE = {
  metadata: {
    label: "Estimated shipping preview",
    basis: "Based on current internal rate table",
    confirmation: "Final shipping cost confirmed after warehouse packing."
  },
  zones: {
    northAmerica: {
      countries: ["US", "CA"],
      sizeSurchargesJPY: {
        standard: { medium: 250, large: 700, oversize: 1400 },
        express: { medium: 350, large: 900, oversize: 1800 }
      },
      methods: {
        standard: [
          { maxKg: 0.5, priceJPY: 2900 },
          { maxKg: 1, priceJPY: 3600 },
          { maxKg: 2, priceJPY: 4700 },
          { maxKg: 3, priceJPY: 5900 },
          { maxKg: 5, priceJPY: 7900 },
          { maxKg: 7, priceJPY: 9900 },
          { maxKg: 10, priceJPY: 12600 }
        ],
        express: [
          { maxKg: 0.5, priceJPY: 4300 },
          { maxKg: 1, priceJPY: 5400 },
          { maxKg: 2, priceJPY: 7100 },
          { maxKg: 3, priceJPY: 8600 },
          { maxKg: 5, priceJPY: 11100 },
          { maxKg: 7, priceJPY: 13800 },
          { maxKg: 10, priceJPY: 17600 }
        ]
      }
    },
    europe: {
      countries: ["GB", "FR"],
      sizeSurchargesJPY: {
        standard: { medium: 250, large: 650, oversize: 1300 },
        express: { medium: 350, large: 850, oversize: 1700 }
      },
      methods: {
        standard: [
          { maxKg: 0.5, priceJPY: 2700 },
          { maxKg: 1, priceJPY: 3400 },
          { maxKg: 2, priceJPY: 4500 },
          { maxKg: 3, priceJPY: 5600 },
          { maxKg: 5, priceJPY: 7600 },
          { maxKg: 7, priceJPY: 9400 },
          { maxKg: 10, priceJPY: 12000 }
        ],
        express: [
          { maxKg: 0.5, priceJPY: 4100 },
          { maxKg: 1, priceJPY: 5100 },
          { maxKg: 2, priceJPY: 6700 },
          { maxKg: 3, priceJPY: 8200 },
          { maxKg: 5, priceJPY: 10500 },
          { maxKg: 7, priceJPY: 13100 },
          { maxKg: 10, priceJPY: 16700 }
        ]
      }
    },
    asiaPacific: {
      countries: ["SG", "AU"],
      sizeSurchargesJPY: {
        standard: { medium: 200, large: 600, oversize: 1200 },
        express: { medium: 300, large: 800, oversize: 1600 }
      },
      methods: {
        standard: [
          { maxKg: 0.5, priceJPY: 2300 },
          { maxKg: 1, priceJPY: 2900 },
          { maxKg: 2, priceJPY: 3900 },
          { maxKg: 3, priceJPY: 4900 },
          { maxKg: 5, priceJPY: 6700 },
          { maxKg: 7, priceJPY: 8500 },
          { maxKg: 10, priceJPY: 10900 }
        ],
        express: [
          { maxKg: 0.5, priceJPY: 3600 },
          { maxKg: 1, priceJPY: 4500 },
          { maxKg: 2, priceJPY: 5900 },
          { maxKg: 3, priceJPY: 7200 },
          { maxKg: 5, priceJPY: 9300 },
          { maxKg: 7, priceJPY: 11700 },
          { maxKg: 10, priceJPY: 14900 }
        ]
      }
    },
    restOfWorld: {
      countries: [],
      sizeSurchargesJPY: {
        standard: { medium: 300, large: 800, oversize: 1500 },
        express: { medium: 400, large: 1000, oversize: 1900 }
      },
      methods: {
        standard: [
          { maxKg: 0.5, priceJPY: 3200 },
          { maxKg: 1, priceJPY: 4000 },
          { maxKg: 2, priceJPY: 5200 },
          { maxKg: 3, priceJPY: 6500 },
          { maxKg: 5, priceJPY: 8600 },
          { maxKg: 7, priceJPY: 10800 },
          { maxKg: 10, priceJPY: 13600 }
        ],
        express: [
          { maxKg: 0.5, priceJPY: 4700 },
          { maxKg: 1, priceJPY: 5900 },
          { maxKg: 2, priceJPY: 7600 },
          { maxKg: 3, priceJPY: 9300 },
          { maxKg: 5, priceJPY: 11900 },
          { maxKg: 7, priceJPY: 14800 },
          { maxKg: 10, priceJPY: 18800 }
        ]
      }
    }
  }
};

export const findShippingZone = (countryCode = "") => {
  const normalizedCountry = String(countryCode || "").trim().toUpperCase();
  const matchingEntry = Object.entries(SHIPPING_RATE_TABLE.zones).find(([, zone]) =>
    zone.countries.includes(normalizedCountry)
  );

  if (matchingEntry) {
    const [zoneKey, zone] = matchingEntry;
    return { zoneKey, zone };
  }

  return { zoneKey: "restOfWorld", zone: SHIPPING_RATE_TABLE.zones.restOfWorld };
};
