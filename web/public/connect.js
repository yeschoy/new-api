(function() {
  "use strict";
  const CONNECT_CODES_ISSUE_PATH = "/api/desktop/v2/connect-codes";
  const AUTH_REFRESH_PATH = "/api/user/auth/refresh";
  const DEFAULT_DOWNLOAD_URL = "https://yeschoy.com/download";
  const SESSION_REQUIRED_CODES = new Set([
    "session_required",
    "AUTH_UNAUTHORIZED",
    "AUTH_TOKEN_EXPIRED",
    "AUTH_SESSION_REVOKED"
  ]);

  // Access tokens live only in memory for this page. The refresh cookie is
  // HttpOnly and Path=/api/user/auth, so bare credentials:include calls to
  // /api/user/self or /api/desktop/v2/connect-codes always look anonymous.
  let cachedAccessToken = null;
  let cachedAccessExpiresAt = 0;

  function normalizeConnectIssueReasonCode(code, httpStatus) {
    const normalized = typeof code === "string" ? code.trim() : "";
    if (SESSION_REQUIRED_CODES.has(normalized)) {
      return "session_required";
    }
    if (httpStatus === 401) {
      if (!normalized || normalized.startsWith("AUTH_")) {
        return "session_required";
      }
    }
    return normalized || "issue_failed";
  }

  class YeschoyConnectError extends Error {
    constructor(reasonCode, httpStatus) {
      super(reasonCode);
      this.name = "YeschoyConnectError";
      this.reasonCode = reasonCode;
      this.httpStatus = httpStatus;
    }
  }

  function pageHttpsOrigin(location) {
    if (location.protocol !== "https:") {
      return null;
    }
    return location.origin;
  }

  function buildConnectDeepLink(origin, code) {
    const params = new URLSearchParams();
    params.set("origin", origin);
    params.set("code", code);
    return `yeschoy://connect?${params.toString()}`;
  }

  function readEnvelopeCode(body) {
    if (!body || typeof body !== "object") return "";
    return typeof body.code === "string" ? body.code : "";
  }

  async function parseJsonBody(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  function cacheAccessToken(token, expiresAt) {
    cachedAccessToken = token;
    cachedAccessExpiresAt =
      typeof expiresAt === "number" && expiresAt > 0 ? expiresAt : 0;
  }

  function cachedTokenStillValid() {
    if (!cachedAccessToken) return false;
    if (!cachedAccessExpiresAt) return true;
    // Refresh a bit early so issue requests do not race expiry.
    return cachedAccessExpiresAt > Math.floor(Date.now() / 1000) + 30;
  }

  /**
   * Exchange the HttpOnly refresh cookie for a short-lived access token.
   * Required before any dashboard API call from this standalone HTML page.
   */
  async function refreshBrowserAccessToken(fetchImpl) {
    if (cachedTokenStillValid()) {
      return cachedAccessToken;
    }
    const response = await fetchImpl(AUTH_REFRESH_PATH, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" }
    });
    const body = await parseJsonBody(response);
    if (!response.ok || !body || typeof body !== "object" || !body.success) {
      throw new YeschoyConnectError(
        normalizeConnectIssueReasonCode(readEnvelopeCode(body), response.status),
        response.status
      );
    }
    const data = body.data;
    if (
      !data ||
      typeof data !== "object" ||
      typeof data.access_token !== "string" ||
      !data.access_token
    ) {
      throw new YeschoyConnectError("issue_invalid_response", response.status);
    }
    cacheAccessToken(
      data.access_token,
      typeof data.access_expires_at === "number" ? data.access_expires_at : 0
    );
    return data.access_token;
  }

  async function issueConnectCode(fetchImpl, origin, issuePath) {
    const accessToken = await refreshBrowserAccessToken(fetchImpl);
    const response = await fetchImpl(issuePath, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + accessToken
      },
      body: JSON.stringify({ origin })
    });
    const body = await parseJsonBody(response);
    if (!body || typeof body !== "object" || !("success" in body)) {
      throw new YeschoyConnectError(
        normalizeConnectIssueReasonCode("", response.status),
        response.status
      );
    }
    const envelope = body;
    if (!envelope.success) {
      throw new YeschoyConnectError(
        normalizeConnectIssueReasonCode(envelope.code, response.status),
        response.status
      );
    }
    const data = envelope.data;
    if (!data || typeof data !== "object") {
      throw new YeschoyConnectError("issue_invalid_response", response.status);
    }
    const record = data;
    if (typeof record.code !== "string" || typeof record.origin !== "string") {
      throw new YeschoyConnectError("issue_invalid_response", response.status);
    }
    return { code: record.code, origin: record.origin };
  }

  function navigateDeepLinkWithDownloadFallback(deepLink, downloadUrl, win, options) {
    let fallbackScheduled = true;
    const clearFallback = () => {
      fallbackScheduled = false;
    };
    const timer = win.setTimeout(() => {
      if (!fallbackScheduled) return;
      options.onFallbackDownload?.();
      win.location.assign(downloadUrl);
    }, options.missingAppTimeoutMs);
    const onBlur = () => {
      win.clearTimeout(timer);
      clearFallback();
      win.removeEventListener?.("blur", onBlur);
    };
    win.addEventListener("blur", onBlur);
    options.onOpening?.();
    win.location.href = deepLink;
  }

  function createYeschoyConnect(defaults = {}) {
    const issuePath = defaults.issuePath ?? CONNECT_CODES_ISSUE_PATH;
    const downloadUrl = defaults.downloadUrl ?? DEFAULT_DOWNLOAD_URL;
    const missingAppTimeoutMs = defaults.missingAppTimeoutMs ?? 2e3;
    const getOrigin = defaults.getOrigin ?? (() => typeof window !== "undefined" ? pageHttpsOrigin(window.location) : null);
    const dispatchPhase = defaults.dispatchPhase ?? (() => {
    });

    async function ensureAccessToken(options = {}) {
      const fetchImpl = options.fetchImpl ?? fetch;
      return refreshBrowserAccessToken(fetchImpl);
    }

    async function open(options = {}) {
      const fetchImpl = options.fetchImpl ?? fetch;
      const origin = options.origin ?? getOrigin();
      if (!origin) {
        throw new YeschoyConnectError("connect_origin_not_https");
      }
      const path = options.issuePath ?? issuePath;
      const fallbackUrl = options.downloadUrl ?? downloadUrl;
      const timeoutMs = options.missingAppTimeoutMs ?? missingAppTimeoutMs;
      dispatchPhase("issuing");
      const issued = await issueConnectCode(fetchImpl, origin, path);
      const deepLink = buildConnectDeepLink(issued.origin, issued.code);
      if (typeof window === "undefined") {
        throw new YeschoyConnectError("browser_only");
      }
      navigateDeepLinkWithDownloadFallback(deepLink, fallbackUrl, window, {
        missingAppTimeoutMs: timeoutMs,
        onOpening: () => dispatchPhase("opening"),
        onFallbackDownload: () => dispatchPhase("redirect_download")
      });
    }

    function bindAuto(root = document) {
      const nodes = root.querySelectorAll("[data-yeschoy-connect]");
      nodes.forEach((el) => {
        if (el.dataset.yeschoyConnectBound === "1") return;
        el.dataset.yeschoyConnectBound = "1";
        el.addEventListener("click", (event) => {
          event.preventDefault();
          void open().catch((err) => {
            el.dispatchEvent(
              new CustomEvent("yeschoy-connect-error", {
                detail: err,
                bubbles: true
              })
            );
          });
        });
      });
    }

    return {
      issuePath,
      downloadUrl,
      normalizeIssueReasonCode: normalizeConnectIssueReasonCode,
      ensureAccessToken,
      open,
      bindAuto
    };
  }

  const scriptEl = document.currentScript;
  const downloadOverride = scriptEl instanceof HTMLScriptElement ? scriptEl.dataset.downloadUrl?.trim() : void 0;
  const api = createYeschoyConnect({
    downloadUrl: downloadOverride || void 0
  });
  window.YeschoyConnect = api;
  function init() {
    api.bindAuto();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
