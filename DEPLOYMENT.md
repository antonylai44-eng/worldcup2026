# 公開部署說明

建議部署到 Render Free Web Service。

原因：這個專案不是純靜態網站。瀏覽器會呼叫 `/api/dashboard`，而這個 API 是由 `local_server.py` 提供。若只上傳 `public/` 到靜態 hosting，頁面可以打開，但即時資料 API 不會運作。

## Render 部署步驟

1. 建立 GitHub repository。
2. 確認 `.env` 不會被 commit；目前 `.gitignore` 已包含 `.env`。
3. Push 整個專案到 GitHub。
4. 在 Render 建立 Blueprint 或 Web Service。
5. 如果手動建立 Web Service，請使用：
   - Runtime：Python
   - Build Command：留空
   - Start Command：`python3 local_server.py`
   - Plan：Free
   - Environment Variable：`HOST=0.0.0.0`
6. 在 Render Environment Variables 加入需要的設定：
   - `FOOTBALL_DATA_TOKEN`
   - `ODDS_API_KEY`
   - `GOOGLE_SHEET_PREDICTIONS_CSV_URL`
   - `SPORTMONKS_API_TOKEN`
   - `SPORTMONKS_WORLD_CUP_SEASON_ID`
   - `ELO_RATINGS_BASE_URL`

只需要加入你實際使用的資料來源。沒有 token 時，頁面仍可用範例資料顯示。

## API key 會不會曝光？

如果按目前架構部署，API key 不會被瀏覽器看到。

原因：

- 瀏覽器只呼叫你的網站：`/api/dashboard`。
- `local_server.py` 在伺服器端讀取環境變數，再代你呼叫 football-data.org、The Odds API、Sportmonks。
- 回傳給瀏覽器的是整理後的比賽資料，不包含 token。

但以下做法會曝光：

- 把 token 寫入 `public/app.js` 或 `public/index.html`。
- 把 token 寫入 React client code，尤其是 `VITE_*` 變數。
- 把 `.env` commit 到 GitHub。
- 把 token 貼到任何公開 README、issue、網頁或截圖。

## Google Sheet 注意

`GOOGLE_SHEET_PREDICTIONS_CSV_URL` 通常不是 API key，但它可能包含你的試算表 ID。若該 Google Sheet 是公開 CSV，任何知道 URL 的人都可以讀取內容。

如果你不想公開試算表 ID，請不要把 URL 寫在 repo；只把它放在 Render Environment Variables。

## 靜態 hosting 替代方案

Netlify、Cloudflare Pages、GitHub Pages、InfinityFree、Vercel Static Hosting 都可以放靜態頁面，但現在這個版本需要 Python API。除非你另外改成 serverless function 或獨立 backend，否則不建議只用靜態 hosting。
