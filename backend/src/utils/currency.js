const exchangeTable = {
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

export const getExchangeRate = (currency = "USD") => exchangeTable[currency] || exchangeTable.USD;

export const convertFromJPY = (amount, currency = "USD") =>
  Math.round(amount * getExchangeRate(currency) * 100) / 100;
