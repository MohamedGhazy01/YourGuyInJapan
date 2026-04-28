const MARKETPLACE_RULES = [
  {
    label: "Mercari",
    action: "request_review",
    patterns: [/mercari/i]
  },
  {
    label: "Rakuma",
    action: "request_review",
    patterns: [/rakuma/i, /\bfril\b/i]
  },
  {
    label: "Yahoo Auctions",
    action: "request_review",
    patterns: [/auctions\.yahoo/i, /page\.auctions\.yahoo/i, /yahoo auctions/i]
  },
  {
    label: "Amazon Japan",
    action: "checkout_now",
    patterns: [/amazon\.co\.jp/i, /amazon japan/i]
  },
  {
    label: "Rakuten",
    action: "checkout_now",
    patterns: [/rakuten/i]
  }
];

const REVIEW_KEYWORDS = [/\bauction\b/i, /\bused\b/i, /\bpre[-\s]?owned\b/i, /\bflea\b/i];

const DEFAULT_POLICY = {
  source: "",
  checkoutAction: "add_to_cart",
  checkoutLabel: "Add to cart",
  requiresProxyApproval: false,
  canCheckoutNow: false
};

const getHostname = (value = "") => {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
};

export const getMarketplaceSourceLabel = (sourceUrl = "", fallbackSource = "") => {
  const hostname = getHostname(sourceUrl);
  const haystack = [hostname, fallbackSource].filter(Boolean).join(" ");

  const matchedRule = MARKETPLACE_RULES.find((rule) =>
    rule.patterns.some((pattern) => pattern.test(haystack))
  );

  if (matchedRule) {
    return matchedRule.label;
  }

  return fallbackSource || hostname;
};

export const getMarketplacePolicy = ({ source = "", sourceUrl = "" } = {}) => {
  const hostname = getHostname(sourceUrl);
  const resolvedSource = getMarketplaceSourceLabel(sourceUrl, source);
  const haystack = [hostname, resolvedSource, sourceUrl].filter(Boolean).join(" ");

  const matchedRule = MARKETPLACE_RULES.find((rule) =>
    rule.patterns.some((pattern) => pattern.test(haystack))
  );

  if (matchedRule) {
    return {
      source: matchedRule.label,
      checkoutAction: matchedRule.action,
      checkoutLabel: matchedRule.action === "checkout_now" ? "Checkout Now" : "Request Review",
      requiresProxyApproval: matchedRule.action === "request_review",
      canCheckoutNow: matchedRule.action === "checkout_now"
    };
  }

  if (REVIEW_KEYWORDS.some((pattern) => pattern.test(haystack))) {
    return {
      source: resolvedSource,
      checkoutAction: "request_review",
      checkoutLabel: "Request Review",
      requiresProxyApproval: true,
      canCheckoutNow: false
    };
  }

  return {
    ...DEFAULT_POLICY,
    source: resolvedSource
  };
};
