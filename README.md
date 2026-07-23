# Crypto AI Dashboard

BingX USDT 永續合約市場掃描器。

目前版本：`v0.1.0`

## 目前功能

- 從 BingX 公開 API 取得永續合約清單
- 掃描 `XXX-USDT` 合約
- 顯示最新價格
- 顯示 24 小時漲跌幅
- 顯示 24 小時最高價與最低價
- 顯示成交量與成交額
- 支援幣種搜尋
- 支援成交額、價格與漲跌幅排序
- 不需要 BingX API Key
- 不包含下單功能

## 專案架構

```text
crypto-ai-dashboard/
├─ index.html
├─ styles.css
├─ app.js
├─ server.js
├─ package.json
├─ .gitignore
└─ README.md
