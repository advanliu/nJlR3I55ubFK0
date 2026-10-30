# cloudsave — 個人雲端備份 Worker

給 `afk-cloudsave.js`(遊戲內「⚙ 設定 → ☁ 雲端備份」)用的後端。整包資料原樣存、原樣吐,只有知道密碼的人能讀寫。
免費額度就夠用(Workers + KV,不用綁信用卡)。

## 部署(只需做一次)

```bash
cd cf-cloudsave

# 1. 登入 Cloudflare(會開瀏覽器)
npx wrangler login

# 2. 建一個 KV 空間,把印出來的 id 貼進 wrangler.toml 的 kv_namespaces.id
npx wrangler kv namespace create SAVES

# 3. 設密碼(自己想一串夠長的,遊戲裡要輸入同一串)
npx wrangler secret put SAVE_TOKEN

# 4. 部署,最後會印出網址 https://cloudsave.<子網域>.workers.dev
npx wrangler deploy
```

把第 4 步的網址和第 3 步的密碼填進遊戲的「☁ 雲端備份」就完成了。每台裝置各填一次。

## 本機測試

```bash
cd cf-cloudsave
echo SAVE_TOKEN=test-token > .dev.vars
npx wrangler dev --port 8787
```

`wrangler dev` 用本機模擬的 KV,不會動到線上資料。

## API

全部要帶 `Authorization: Bearer <SAVE_TOKEN>`。

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/backups` | 備份清單 `[{id, at, device, size}]`,新到舊 |
| POST | `/backups?device=名稱` | 上傳一份(body=整包文字),超過 `KEEP` 份刪最舊的 |
| GET | `/backups/<id>` | 下載該份 |

## 換密碼

`npx wrangler secret put SAVE_TOKEN` 輸入新的,再到每台裝置的遊戲裡改成新密碼。
