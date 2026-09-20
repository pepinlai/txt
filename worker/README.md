# 小說選題 API

此 Worker 只負責兩件事：先查公開 YouTube 趨勢後找 60 本候選作品，以及把「題材訊號」生成為完全獨立原創短劇。它不會、也不應該續寫未授權原作。

## 首次部署

```bash
cd worker
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put DASHBOARD_ACCESS_KEY
npx wrangler secret put ALLOWED_ORIGIN
npx wrangler deploy
```

`ALLOWED_ORIGIN` 請填 GitHub Pages 的完整網址，例如 `https://帳號.github.io` 或 `https://帳號.github.io/專案名稱` 的 **origin 部分** `https://帳號.github.io`。部署完成後，把 Worker 網址填入專案根目錄的 `dashboard-config.js`。

瀏覽器第一次按「再找 60 本」或「生成原創五集／全集」時，會要求輸入 `DASHBOARD_ACCESS_KEY`；它只保存在該瀏覽器分頁工作階段，並非 OpenAI 金鑰。

## 長期累積資料（建議）

沒有 KV 時，結果只會留在目前瀏覽器。要讓研究批次與稿件在部署後仍可保存，先建立 KV：

```bash
npx wrangler kv namespace create NOVEL_STORE
```

把輸出的 namespace id 加進 `wrangler.jsonc`：

```jsonc
"kv_namespaces": [{ "binding": "NOVEL_STORE", "id": "貼上 namespace id" }]
```

再執行 `npx wrangler deploy`。Worker 偵測到 `NOVEL_STORE` 後，會自動保存批次與稿件。

## 本機驗證

```bash
cd worker
npx wrangler dev
```

以靜態網頁伺服器開啟專案根目錄，再將頁面 API 網址暫設為本機 Worker URL。不要把任一 secret 寫進 `dashboard-config.js` 或提交至 Git。
