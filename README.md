
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
