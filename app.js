"use strict";

const API_ENDPOINTS = {
  contracts: "/api/contracts",
  tickers: "/api/tickers"
};

const state = {
  markets: [],
  filteredMarkets: [],
  searchTerm: "",
  sortKey: "quoteVolume",
  sortDirection: "desc",
  loading: false
};

const elements = {
  refreshButton: document.getElementById("refreshButton"),
  searchInput: document.getElementById("searchInput"),
  sortSelect: document.getElementById("sortSelect"),

  apiStatus: document.getElementById("apiStatus"),
  apiStatusNote: document.getElementById("apiStatusNote"),

  totalContracts: document.getElementById("totalContracts"),
  visibleContracts: document.getElementById("visibleContracts"),
  lastUpdated: document.getElementById("lastUpdated"),

  messageBox: document.getElementById("messageBox"),
  marketTableBody: document.getElementById("marketTableBody")
};

function toNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function getText(object, keys) {
  for (const key of keys) {
    const value = object?.[key];

    if (
      typeof value === "string" &&
      value.trim() !== ""
    ) {
      return value.trim();
    }
  }

  return "";
}

function getNumber(object, keys) {
  for (const key of keys) {
    const parsed = toNumber(object?.[key]);

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function normalizeSymbol(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function extractApiArray(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.data?.list)) {
    return payload.data.list;
  }

  if (Array.isArray(payload?.data?.data)) {
    return payload.data.data;
  }

  if (Array.isArray(payload?.list)) {
    return payload.list;
  }

  return [];
}

async function requestJson(url, timeoutMs = 15000) {
  const controller = new AbortController();

  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      cache: "no-store",
      signal: controller.signal
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        payload?.message ||
        payload?.error ||
        `HTTP ${response.status}`;

      throw new Error(message);
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("請求逾時，請稍後重新整理。");
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function isUsdtContract(contract) {
  const symbol = normalizeSymbol(
    getText(contract, [
      "symbol",
      "contractSymbol",
      "tradePair"
    ])
  );

  if (!/^[A-Z0-9]+-USDT$/.test(symbol)) {
    return false;
  }

  const status = String(
    contract?.status ??
    contract?.tradeStatus ??
    contract?.state ??
    ""
  ).toUpperCase();

  const disabledStatuses = new Set([
    "OFFLINE",
    "SUSPENDED",
    "DISABLED",
    "DELISTED",
    "CLOSED",
    "STOP"
  ]);

  return !disabledStatuses.has(status);
}

function normalizeTicker(ticker) {
  const symbol = normalizeSymbol(
    getText(ticker, [
      "symbol",
      "contractSymbol",
      "tradePair"
    ])
  );

  const lastPrice = getNumber(ticker, [
    "lastPrice",
    "last",
    "close",
    "closePrice",
    "price"
  ]);

  const openPrice = getNumber(ticker, [
    "openPrice",
    "open"
  ]);

  let changePercent = getNumber(ticker, [
    "priceChangePercent",
    "changePercent"
  ]);

  const rateValue = getNumber(ticker, [
    "priceChangeRate",
    "changeRate"
  ]);

  if (rateValue !== null) {
    changePercent =
      Math.abs(rateValue) <= 1
        ? rateValue * 100
        : rateValue;
  }

  if (
    changePercent === null &&
    lastPrice !== null &&
    openPrice !== null &&
    openPrice !== 0
  ) {
    changePercent =
      ((lastPrice - openPrice) / openPrice) * 100;
  }

  return {
    symbol,
    lastPrice,
    changePercent,

    highPrice: getNumber(ticker, [
      "highPrice",
      "high"
    ]),

    lowPrice: getNumber(ticker, [
      "lowPrice",
      "low"
    ]),

    volume: getNumber(ticker, [
      "volume",
      "baseVolume",
      "vol"
    ]),

    quoteVolume: getNumber(ticker, [
      "quoteVolume",
      "quoteVol",
      "turnover",
      "amount"
    ])
  };
}

function mergeMarkets(contracts, tickers) {
  const tickerMap = new Map();

  tickers
    .map(normalizeTicker)
    .filter((ticker) => ticker.symbol)
    .forEach((ticker) => {
      tickerMap.set(ticker.symbol, ticker);
    });

  return contracts
    .filter(isUsdtContract)
    .map((contract) => {
      const symbol = normalizeSymbol(
        getText(contract, [
          "symbol",
          "contractSymbol",
          "tradePair"
        ])
      );

      const ticker = tickerMap.get(symbol);

      return {
        symbol,

        tradingViewSymbol:
          `${symbol.replace("-", "")}.P`,

        lastPrice:
          ticker?.lastPrice ?? null,

        changePercent:
          ticker?.changePercent ?? null,

        highPrice:
          ticker?.highPrice ?? null,

        lowPrice:
          ticker?.lowPrice ?? null,

        volume:
          ticker?.volume ?? null,

        quoteVolume:
          ticker?.quoteVolume ?? null
      };
    })
    .filter((market) => market.symbol);
}

function formatPrice(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  if (value >= 1000) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  if (value >= 1) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    });
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 10
  });
}

function formatCompact(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("zh-TW", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const sign = value > 0 ? "+" : "";

  return `${sign}${value.toFixed(2)}%`;
}

function getChangeClass(value) {
  if (!Number.isFinite(value) || value === 0) {
    return "neutral";
  }

  return value > 0
    ? "positive"
    : "negative";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function compareNumbers(a, b, direction) {
  const aValid = Number.isFinite(a);
  const bValid = Number.isFinite(b);

  if (!aValid && !bValid) {
    return 0;
  }

  if (!aValid) {
    return 1;
  }

  if (!bValid) {
    return -1;
  }

  return direction === "asc"
    ? a - b
    : b - a;
}

function applyFiltersAndSort() {
  const keyword = state.searchTerm
    .trim()
    .toUpperCase();

  state.filteredMarkets = state.markets.filter(
    (market) => {
      if (!keyword) {
        return true;
      }

      return (
        market.symbol.includes(keyword) ||
        market.tradingViewSymbol.includes(keyword)
      );
    }
  );

  state.filteredMarkets.sort((a, b) => {
    if (state.sortKey === "symbol") {
      const result = a.symbol.localeCompare(b.symbol);

      return state.sortDirection === "asc"
        ? result
        : -result;
    }

    const propertyMap = {
      price: "lastPrice",
      change: "changePercent",
      quoteVolume: "quoteVolume"
    };

    const property =
      propertyMap[state.sortKey] || state.sortKey;

    return compareNumbers(
      a[property],
      b[property],
      state.sortDirection
    );
  });

  renderTable();
  updateCounters();
}

function renderTable() {
  if (state.loading) {
    elements.marketTableBody.innerHTML = `
      <tr>
        <td class="empty-cell" colspan="9">
          正在讀取 BingX 市場資料……
        </td>
      </tr>
    `;

    return;
  }

  if (state.filteredMarkets.length === 0) {
    elements.marketTableBody.innerHTML = `
      <tr>
        <td class="empty-cell" colspan="9">
          沒有符合條件的 USDT 永續合約
        </td>
      </tr>
    `;

    return;
  }

  elements.marketTableBody.innerHTML =
    state.filteredMarkets
      .map((market, index) => {
        return `
          <tr>
            <td class="rank">
              ${index + 1}
            </td>

            <td>
              <span class="symbol">
                ${escapeHtml(market.symbol)}
              </span>
            </td>

            <td>
              <span class="tv-symbol">
                ${escapeHtml(market.tradingViewSymbol)}
              </span>
            </td>

            <td>
              ${formatPrice(market.lastPrice)}
            </td>

            <td class="${getChangeClass(
              market.changePercent
            )}">
              ${formatPercent(market.changePercent)}
            </td>

            <td>
              ${formatPrice(market.highPrice)}
            </td>

            <td>
              ${formatPrice(market.lowPrice)}
            </td>

            <td>
              ${formatCompact(market.volume)}
            </td>

            <td>
              ${formatCompact(market.quoteVolume)}
            </td>
          </tr>
        `;
      })
      .join("");
}

function updateCounters() {
  elements.totalContracts.textContent =
    state.markets.length.toLocaleString("zh-TW");

  elements.visibleContracts.textContent =
    state.filteredMarkets.length.toLocaleString("zh-TW");
}

function setApiStatus(status, note) {
  elements.apiStatus.className = "summary-value";

  if (status === "loading") {
    elements.apiStatus.textContent = "連線中";
    elements.apiStatus.classList.add("status-loading");
  } else if (status === "online") {
    elements.apiStatus.textContent = "已連線";
    elements.apiStatus.classList.add("status-online");
  } else if (status === "error") {
    elements.apiStatus.textContent = "連線失敗";
    elements.apiStatus.classList.add("status-error");
  } else {
    elements.apiStatus.textContent = "等待連線";
    elements.apiStatus.classList.add("status-idle");
  }

  elements.apiStatusNote.textContent = note;
}

function showMessage(message, type = "error") {
  elements.messageBox.textContent = message;
  elements.messageBox.className =
    `message-box visible ${type}`;
}

function hideMessage() {
  elements.messageBox.textContent = "";
  elements.messageBox.className = "message-box";
}

function setLoading(loading) {
  state.loading = loading;

  elements.refreshButton.disabled = loading;

  elements.refreshButton.textContent = loading
    ? "讀取中…"
    : "重新整理";

  renderTable();
}

async function loadMarketData() {
  hideMessage();
  setLoading(true);

  setApiStatus(
    "loading",
    "正在透過本機伺服器讀取 BingX"
  );

  try {
    const [contractsPayload, tickersPayload] =
      await Promise.all([
        requestJson(API_ENDPOINTS.contracts),
        requestJson(API_ENDPOINTS.tickers)
      ]);

    const contracts =
      extractApiArray(contractsPayload);

    const tickers =
      extractApiArray(tickersPayload);

    if (contracts.length === 0) {
      throw new Error(
        "合約端點沒有回傳有效資料。"
      );
    }

    state.markets = mergeMarkets(
      contracts,
      tickers
    );

    if (state.markets.length === 0) {
      throw new Error(
        "沒有找到符合 XXX-USDT 格式的合約。"
      );
    }

    const currentTime = new Date();

    elements.lastUpdated.textContent =
      currentTime.toLocaleString("zh-TW", {
        hour12: false
      });

    setApiStatus(
      "online",
      `已讀取 ${state.markets.length} 個合約`
    );

    applyFiltersAndSort();
  } catch (error) {
    console.error("Load market data error:", error);

    state.markets = [];
    state.filteredMarkets = [];

    setApiStatus(
      "error",
      "無法取得市場資料"
    );

    showMessage(
      error instanceof Error
        ? error.message
        : "發生未知錯誤。"
    );

    updateCounters();
  } finally {
    setLoading(false);
  }
}

elements.searchInput.addEventListener(
  "input",
  (event) => {
    state.searchTerm = event.target.value;
    applyFiltersAndSort();
  }
);

elements.sortSelect.addEventListener(
  "change",
  (event) => {
    const [sortKey, sortDirection] =
      event.target.value.split("-");

    state.sortKey = sortKey;
    state.sortDirection = sortDirection;

    applyFiltersAndSort();
  }
);

elements.refreshButton.addEventListener(
  "click",
  loadMarketData
);

loadMarketData();
