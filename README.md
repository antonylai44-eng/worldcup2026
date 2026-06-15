# 2026 FIFA 世界盃預測儀表板

這是一個可公開部署的世界盃網頁儀表板。頁面會顯示分組積分榜、賽果、完整賽程、淘汰賽走線、冠軍賠率、Elo 預測，以及 Google Sheet 模型共識。

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/antonylai44-eng/worldcup2026)

## 目前架構

```text
瀏覽器
  |
  | 讀取 public/index.html、public/styles.css、public/app.js
  | 呼叫 /api/dashboard、/api/refresh-elo、/api/refresh-odds
  v
local_server.py
  - 提供靜態網頁
  - 代理外部 API 請求
  - 把 API token 留在伺服器端
  - 快取賽程、賠率、Elo、Google Sheet 預測
  |
  +--> football-data.org
  +--> Sportmonks，可選
  +--> The Odds API，可選
  +--> Google Sheet CSV，可選
  +--> World Football Elo
```

重點：不要只把 `public/` 放上純靜態 hosting，否則 `/api/dashboard` 不會存在，只能顯示範例資料或錯誤。要有即時資料，必須部署 `local_server.py` 這類後端。

## 本機執行

macOS 內建 Python 已足夠：

```bash
python3 local_server.py
```

打開：

```text
http://localhost:8080
```

如果 `8080` 已被佔用，程式會自動嘗試下一個 port，例如 `8081`。

## 環境變數

請在本機建立 `.env`，或在 Render 等 hosting 平台的 Environment Variables 裡設定。

```bash
cp .env.example .env
```

主要設定：

- `FOOTBALL_DATA_TOKEN`：建議至少設定這個，提供世界盃賽程、賽果、積分榜。
- `ODDS_API_KEY`：可選，用來顯示冠軍賠率及賽事賠率機率。
- `GOOGLE_SHEET_PREDICTIONS_CSV_URL`：可選，用來讀取你的 Google Sheet 模型預測 CSV。
- `ELO_RATINGS_BASE_URL`：可選，預設使用 `https://www.eloratings.net`。
- `SPORTMONKS_API_TOKEN` / `SPORTMONKS_WORLD_CUP_SEASON_ID`：可選，作為另一個足球資料來源。
- `HOST`：本機不用設定；部署到 Render 時設定為 `0.0.0.0`。
- `PORT`：本機預設 `8080`；Render 會自動提供。

如果沒有設定 token，網頁仍會開啟，但會顯示範例資料。

## 公開部署建議

建議使用 Render Free Web Service，因為它可以免費跑 Python 後端，也可以同時提供靜態網頁。

部署完成後，Render 會提供一個公開的 `https://<service-name>.onrender.com` 網址，任何人都可以直接打開。

步驟：

1. 建立 GitHub repository。
2. 確認 `.env` 沒有被 commit；目前 `.gitignore` 已包含 `.env`。
3. 把整個專案 push 到 GitHub。
4. 在 Render 建立 Web Service 或 Blueprint，連接該 GitHub repo。
5. 如果手動設定 Render：
   - Runtime：Python
   - Build Command：留空
   - Start Command：`python3 local_server.py`
   - Health Check Path：`/health`
   - Plan：Free
   - Environment Variable：`HOST=0.0.0.0`
6. 在 Render 的 Environment Variables 加入你的 token。

如果使用免費方案，網站在 15 分鐘沒有流量後會休眠。下一位訪客第一次打開時，通常需要等大約 1 分鐘讓服務喚醒。

本 repo 已提供 `render.yaml`，Render Blueprint 可以直接讀取。

## 安全注意

- 不要把 `.env` 上傳到 GitHub。
- 不要把 API token/key 寫進 `public/app.js`、`public/index.html`、React client code 或任何會送到瀏覽器的檔案。
- 所有真正的 token/key 只應放在本機 `.env` 或 Render Environment Variables。
- `VITE_*` 變數會被打包進前端，不能放秘密。
- `GOOGLE_SHEET_PREDICTIONS_CSV_URL` 如果是公開試算表連結，不是 API token；但如果你不想公開試算表 ID，也應該只放在 Render 環境變數，不要寫死在 repo。
- 如果 token 曾經被 commit 或貼到公開網頁，請到供應商後台立即 rotate/revoke。

## API 路徑

- `GET /api/dashboard`：前端主要資料來源。
- `GET /api/refresh-elo`：手動清除 Elo/dashboard 快取並重新讀取 Elo。
- `GET /api/refresh-odds`：手動清除 Odds/dashboard 快取並重新讀取 The Odds API。

## 資料來源與快取

- football-data.org：賽程、賽果、積分榜，快取 12 小時。
- The Odds API：冠軍賠率快取 24 小時；賽事賠率每 12 小時更新一次，以平衡即時性與免費 quota。
- Google Sheet CSV：快取到下一個香港時間上午 11:00。
- World Football Elo：快取 12 小時。

## 其他 hosting 選項

Netlify、Cloudflare Pages、GitHub Pages、InfinityFree 等純靜態服務可以放 HTML/CSS/JS，但不能直接跑現在的 `local_server.py`。若使用這些服務，你需要另外部署 backend 或 serverless function，否則即時資料 API 不會運作。
