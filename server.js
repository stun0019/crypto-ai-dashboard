"use strict";

const path = require("path");
const express = require("express");

const app = express();

const PORT = Number(process.env.PORT) || 3000;

const BINGX_BASE_URL =
  "https://open-api.bingx.com";

const BINGX_ENDPOINTS = {
  contracts:
    "/openApi/swap/v2/quote/contracts",

  tickers:
    "/openApi/swap/v2/quote/ticker"
};

app.disable("x-powered-by");

app.use(express.json());

app.use(
  express.static(path.join(__dirname))
);

async function fetchBingX(endpoint) {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 15000);

  try {
    const response = await fetch(
      `${BINGX_BASE_URL}${endpoint}`,
      {
        method: "GET",

        headers: {
          Accept: "application/json",
          "User-Agent":
            "crypto-ai-dashboard/0.1"
        },

        signal: controller.signal
      }
    );

    const responseText = await response.text();

    let payload;

    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new Error(
        "BingX 回傳了無法解析的資料。"
      );
    }

    if (!response.ok) {
      const message =
        payload?.msg ||
        payload?.message ||
        `BingX HTTP ${response.status}`;

      const error = new Error(message);
      error.status = response.status;

      throw error;
    }

    const apiCode = Number(payload?.code);

    if (
      payload?.code !== undefined &&
      Number.isFinite(apiCode) &&
      apiCode !== 0
    ) {
      const error = new Error(
        payload?.msg ||
        payload?.message ||
        `BingX API 錯誤代碼：${apiCode}`
      );

      error.status = 502;

      throw error;
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error(
        "BingX API 請求逾時。"
      );

      timeoutError.status = 504;

      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function sendApiError(response, error) {
  console.error("API proxy error:", error);

  const status =
    Number.isInteger(error.status) &&
    error.status >= 400 &&
    error.status <= 599
      ? error.status
      : 502;

  response.status(status).json({
    success: false,
    error: "BINGX_API_ERROR",
    message:
      error instanceof Error
        ? error.message
        : "無法連接 BingX API。"
  });
}

app.get(
  "/api/contracts",
  async (request, response) => {
    try {
      const payload = await fetchBingX(
        BINGX_ENDPOINTS.contracts
      );

      response.set(
        "Cache-Control",
        "no-store"
      );

      response.json(payload);
    } catch (error) {
      sendApiError(response, error);
    }
  }
);

app.get(
  "/api/tickers",
  async (request, response) => {
    try {
      const payload = await fetchBingX(
        BINGX_ENDPOINTS.tickers
      );

      response.set(
        "Cache-Control",
        "no-store"
      );

      response.json(payload);
    } catch (error) {
      sendApiError(response, error);
    }
  }
);

app.get(
  "/api/health",
  (request, response) => {
    response.json({
      success: true,
      service: "crypto-ai-dashboard",
      version: "0.1.0",
      timestamp: new Date().toISOString()
    });
  }
);

app.get(
  "*",
  (request, response) => {
    response.sendFile(
      path.join(__dirname, "index.html")
    );
  }
);

app.use(
  (error, request, response, next) => {
    console.error("Server error:", error);

    response.status(500).json({
      success: false,
      error: "INTERNAL_SERVER_ERROR",
      message: "伺服器發生未預期錯誤。"
    });
  }
);

app.listen(PORT, () => {
  console.log("");
  console.log("Crypto AI Dashboard 已啟動");
  console.log(`網址：http://localhost:${PORT}`);
  console.log("");
});
