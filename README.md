# Count to 8/14

一個以「第一次見面倒數」為核心的 Vue/Vite 小型 PWA。它把倒數、每日互動、行程規劃、回憶保存、週期紀錄和雲端同步放在同一個私密頁面裡，適合部署到 GitHub Pages，並可選擇搭配 Google Cloud Run + Firestore 做跨裝置同步。

## 功能

- 密碼入口：可透過 Cloud Run API 驗證密碼，也支援本機預覽模式。
- 見面倒數：以 2026/04/08 到 2026/08/14 的時間線為預設設定，可在準備頁調整名稱、起點、終點和主題。
- 今日互動：每日文字、心情、籤語、問答、任務和打卡紀錄。
- 行程規劃：建立多趟旅行、編輯每日行程，並可從文字、試算表或圖片 OCR 匯入行程。
- 回憶保存：照片牆、秘密暗號、小卡、時間膠囊和見面片刻收藏。
- 週期紀錄：紀錄週期、症狀、照護、疼痛程度與趨勢提醒。
- 準備工具：行李清單、見面 checklist、JSON 匯入/匯出、雲端同步。
- PWA 支援：manifest、service worker、安裝提示與更新通知。

## 技術棧

- Frontend：Vue 3、TypeScript、Vite
- PWA：自訂 service worker 與 web app manifest
- 匯入工具：`xlsx`、`tesseract.js`
- Cloud API：Express、Google Cloud Firestore
- 部署：GitHub Pages、Google Cloud Run

## 本機開發

需求：

- Node.js 16.13 以上，建議使用 Node.js 18 或 20。
- 若要啟用雲端同步，需要一個已部署的 Cloud Run API URL。

安裝依賴：

```powershell
npm install
```

建立本機環境設定：

```powershell
Copy-Item .env.example .env.local
```

`.env.local` 範例：

```env
VITE_CLOUD_API_URL=https://your-cloud-run-service-url
VITE_BASE_PATH=./
```

啟動前端：

```powershell
npm run dev
```

建置：

```powershell
npm run build
```

預覽建置結果：

```powershell
npm run preview
```

## Cloud API 本機啟動

Cloud API 位於 `cloud-api/`，用來處理密碼 session、Firestore 狀態儲存和照片同步。

```powershell
cd cloud-api
npm install
$env:APP_PASSWORD="<登入密碼>"
$env:SESSION_SECRET="<一段長隨機字串>"
$env:ALLOWED_ORIGIN="http://127.0.0.1:5173"
npm start
```

健康檢查：

```text
GET /health
```

主要環境變數：

- `APP_PASSWORD`：登入密碼，必填。
- `SESSION_SECRET`：session token 簽章密鑰，正式環境請使用長隨機字串。
- `ALLOWED_ORIGIN`：允許的前端來源。
- `TOKEN_MAX_AGE_MS`：token 有效時間，預設 30 天。
- `FIRESTORE_COLLECTION`：Firestore collection 名稱，預設 `count-to-814`。
- `FIRESTORE_DOCUMENT`：Firestore document 前綴，預設 `app-state`。

## 部署

前端會透過 `.github/workflows/deploy-pages.yml` 在 push 到 `main` 或 `master` 後部署到 GitHub Pages。GitHub Actions 需要設定 repository variable：

```text
VITE_CLOUD_API_URL=https://your-cloud-run-service-url
```

Cloud API 可透過 `.github/workflows/deploy-cloud-run.yml` 部署到 Cloud Run。需要設定：

Secrets：

```text
APP_PASSWORD=<登入密碼>
GCP_SERVICE_ACCOUNT_KEY=<Google service account JSON>
CLOUD_RUN_SESSION_SECRET=<長隨機字串>
```

Variables：

```text
GCP_PROJECT_ID=<Google Cloud project id>
CLOUD_RUN_REGION=asia-east1
CLOUD_RUN_SERVICE=<Cloud Run service name>
CLOUD_RUN_ALLOWED_ORIGIN=https://tamyu321-source.github.io
```

更完整的 Google Cloud Run 和 GitHub Pages 設定流程請看 [DEPLOY.md](./DEPLOY.md)。

## 資料與隱私

- 不要把真實登入密碼或 service account key 寫進 repo。
- 前端資料會先儲存在瀏覽器 localStorage / IndexedDB。
- 啟用 Cloud API 後，資料會依功能分區同步到 Firestore。
- 回憶照片會以 data URL 形式同步，後端目前最多保留 24 張。

## 專案結構

```text
.
├─ src/                 Vue 前端程式
│  ├─ views/            倒數、今日、行程、週期、回憶、準備頁
│  ├─ components/       密碼入口、底部導覽、全域效果
│  ├─ data/             預設文案、日期、主題與清單資料
│  ├─ journey/          行程匯入與排程邏輯
│  └─ styles/           分區 CSS
├─ public/              PWA manifest、icons、service worker、音效
├─ cloud-api/           Express + Firestore API
├─ .github/workflows/   GitHub Pages 與 Cloud Run 部署流程
└─ DEPLOY.md            詳細部署筆記
```

## 常用指令

```powershell
npm run dev       # 啟動本機前端
npm run build     # 型別檢查並建置
npm run preview   # 預覽 dist
```
