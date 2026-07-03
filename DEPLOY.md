# GitHub Pages + Google Cloud 部署

這個專案現在分成兩段：

- GitHub Pages：部署 Vite/Vue 前端。
- Google Cloud Run：提供密碼登入和 Firestore 資料儲存 API。

## 1. 部署 Google Cloud API

先在 Google Cloud 專案啟用 Firestore 和 Cloud Run，然後在專案根目錄執行：

```powershell
gcloud config set project YOUR_PROJECT_ID
gcloud firestore databases create --location=asia-east1
gcloud run deploy count-to-814-api `
  --source cloud-api `
  --region asia-east1 `
  --allow-unauthenticated `
  --set-env-vars APP_PASSWORD="<填入你指定的生日密碼>",SESSION_SECRET="<換成一段更長的隨機字串>",ALLOWED_ORIGIN="https://YOUR_GITHUB_USERNAME.github.io"
```

部署完成後，記下 Cloud Run 顯示的服務網址，例如：

```text
https://count-to-814-api-xxxxx.a.run.app
```

## 2. 設定 GitHub Pages

到 GitHub repo 的 `Settings -> Secrets and variables -> Actions -> Variables` 新增：

```text
VITE_CLOUD_API_URL=https://count-to-814-api-xxxxx.a.run.app
```

再到 `Settings -> Pages`，Source 選 `GitHub Actions`。

推送到 `main` 或 `master` 後，`.github/workflows/deploy-pages.yml` 會自動建置並部署。

## 3. 本機測試

前端：

```powershell
Copy-Item .env.example .env.local
# 編輯 .env.local，把 VITE_CLOUD_API_URL 換成 Cloud Run 網址
npm install
npm run dev
```

API：

```powershell
cd cloud-api
$env:APP_PASSWORD="<填入你指定的生日密碼>"
$env:SESSION_SECRET="local-dev-secret"
$env:ALLOWED_ORIGIN="http://127.0.0.1:5173"
npm install
npm start
```

## 注意

不要把真正密碼寫進 GitHub repo。密碼應該只放在 Cloud Run 的 `APP_PASSWORD` 環境變數中。
