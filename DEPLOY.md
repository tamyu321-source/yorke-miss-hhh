# GitHub Pages + Google Cloud 部署

這個專案現在分成兩段：

- GitHub Pages：部署 Vite/Vue 前端。
- Google Cloud Run：提供密碼登入和 Firestore 資料儲存 API。

GitHub 使用者名稱：`tamyu321-source`

GitHub Pages 頁面名稱：`yorke-miss-hhh`

部署完成後的頁面網址會是：

```text
https://tamyu321-source.github.io/yorke-miss-hhh/
```

## 1. 部署 Google Cloud API

先在 Google Cloud 專案啟用 Firestore 和 Cloud Run，然後在專案根目錄執行：

```powershell
gcloud config set project YOUR_PROJECT_ID
gcloud firestore databases create --location=asia-east1
gcloud run deploy count-to-814-api `
  --source cloud-api `
  --region asia-east1 `
  --allow-unauthenticated `
  --set-env-vars APP_PASSWORD="<填入你指定的生日密碼>",SESSION_SECRET="<換成一段更長的隨機字串>",ALLOWED_ORIGIN="https://tamyu321-source.github.io"
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

GitHub Pages 的公開網址：

```text
https://tamyu321-source.github.io/yorke-miss-hhh/
```

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

## 4. Cloud Run 後端自動更新

前端 GitHub Pages 會在 push 後自動更新。若也想讓 `cloud-api/` 後端自動部署到 Cloud Run，需要再設定一次 GitHub Actions secret。

先在 Cloud Shell 建立部署用 service account：

```bash
gcloud config set project erudite-bloom-249605

gcloud iam service-accounts create github-cloud-run-deployer \
  --display-name="GitHub Cloud Run Deployer"

gcloud projects add-iam-policy-binding erudite-bloom-249605 \
  --member="serviceAccount:github-cloud-run-deployer@erudite-bloom-249605.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding erudite-bloom-249605 \
  --member="serviceAccount:github-cloud-run-deployer@erudite-bloom-249605.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.editor"

gcloud projects add-iam-policy-binding erudite-bloom-249605 \
  --member="serviceAccount:github-cloud-run-deployer@erudite-bloom-249605.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding erudite-bloom-249605 \
  --member="serviceAccount:github-cloud-run-deployer@erudite-bloom-249605.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

產生 GitHub secret 要用的 JSON key：

```bash
gcloud iam service-accounts keys create gcp-service-account-key.json \
  --iam-account="github-cloud-run-deployer@erudite-bloom-249605.iam.gserviceaccount.com"

cat gcp-service-account-key.json
```

到 GitHub repo 的 `Settings -> Secrets and variables -> Actions -> Secrets` 新增：

```text
GCP_SERVICE_ACCOUNT_KEY=<貼上整份 gcp-service-account-key.json 內容>
CLOUD_RUN_SESSION_SECRET=<貼上一段長隨機字串>
```

`CLOUD_RUN_SESSION_SECRET` 可以在 Cloud Shell 產生：

```bash
openssl rand -base64 32
```

設定完成後，只要 push 的內容包含 `cloud-api/**`，`.github/workflows/deploy-cloud-run.yml` 就會自動部署 Cloud Run。也可以到 GitHub Actions 手動執行 `Deploy Cloud Run API`。
