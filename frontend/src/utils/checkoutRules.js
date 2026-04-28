const MARKETPLACE_RULES = [
  {
    source: "Mercari",
    action: "request_review",
    patterns: [/mercari/i]
  },
  {
    source: "Rakuma",
    action: "request_review",
    patterns: [/rakuma/i, /\bfril\b/i]
  },
  {
    source: "Yahoo Auctions",
    action: "request_review",
    patterns: [/auctions\.yahoo/i, /page\.auctions\.yahoo/i, /yahoo auctions/i]
  },
  {
    source: "Amazon Japan",
    action: "checkout_now",
    patterns: [/amazon\.co\.jp/i, /amazon japan/i]
  },
  {
    source: "Rakuten",
    action: "checkout_now",
    patterns: [/rakuten/i]
  }
];

const REVIEW_KEYWORDS = [/\bauction\b/i, /\bused\b/i, /\bpre[-\s]?owned\b/i, /\bflea\b/i];

const getHostname = (value = "") => {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
};

export const getCheckoutMeta = (item = {}) => {
  if (item.checkoutAction && item.checkoutLabel) {
    return {
      source: item.source || "",
      checkoutAction: item.checkoutAction,
      checkoutLabel: item.checkoutLabel,
      requiresProxyApproval: Boolean(item.requiresProxyApproval),
      canCheckoutNow: Boolean(item.canCheckoutNow)
    };
  }

  const hostname = getHostname(item.sourceUrl);
  const haystack = [item.source, hostname, item.sourceUrl].filter(Boolean).join(" ");
  const matchedRule = MARKETPLACE_RULES.find((rule) =>
    rule.patterns.some((pattern) => pattern.test(haystack))
  );

  if (matchedRule) {
    return {
      source: matchedRule.source,
      checkoutAction: matchedRule.action,
      checkoutLabel: matchedRule.action === "checkout_now" ? "Checkout Now" : "Availability Check Required",
      requiresProxyApproval: matchedRule.action === "request_review",
      canCheckoutNow: matchedRule.action === "checkout_now"
    };
  }

  if (REVIEW_KEYWORDS.some((pattern) => pattern.test(haystack))) {
    return {
      source: item.source || hostname,
      checkoutAction: "request_review",
      checkoutLabel: "Availability Check Required",
      requiresProxyApproval: true,
      canCheckoutNow: false
    };
  }

  return {
    source: item.source || hostname,
    checkoutAction: "add_to_cart",
    checkoutLabel: "Add to cart",
    requiresProxyApproval: false,
    canCheckoutNow: false
  };
};

export const getCheckoutPresentation = (item = {}) => {
  const meta = getCheckoutMeta(item);

  if (meta.canCheckoutNow) {
    return {
      ...meta,
      badgeText: "Instant checkout available",
      note: ""
    };
  }

  if (meta.requiresProxyApproval) {
    return {
      ...meta,
      badgeText: "Availability check required",
      note:
        "Usually confirmed within 10-30 minutes. Used/marketplace items may sell out or need condition confirmation before ordering."
    };
  }

  return {
    ...meta,
    badgeText: "",
    note: ""
  };
};
