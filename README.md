# AI iPhone Use

**讓 AI 看見、操作你的 iPhone，也能在手機上跑程式。**<br><br>
在 Windows 上用 Codex、Claude Code 或其他支援本機 MCP 的 AI 連接自己的 iPhone。Pinky 用來操作 App，iSH Shell 用來讀檔、改碼和跑測試，USB 工具則能用資料線直接看畫面、點按和輸入。

## 下載你要的功能

| 功能 | Windows 外掛下載 | 配對與使用 |
| --- | --- | --- |
| **Pinky** · 依控制項名稱操作、導航、批次點按 | [下載 Pinky ZIP](https://github.com/owen201913-cmd/iphone-use/raw/refs/heads/main/downloads/iphone-use-pinky.zip) | [Pinky 安裝指南](docs/pinky.md) · [Pinky 官方程式](https://github.com/DIYgod/pinky/releases/latest) |
| **iSH Shell** · 在 iPhone 的 Linux 工作區讀寫檔案、跑程式 | [下載 iSH ZIP](https://github.com/owen201913-cmd/iphone-use/raw/refs/heads/main/downloads/iphone-use-ish.zip) | [iSH 安裝指南](docs/ish.md) · [iPhone App Store](https://apps.apple.com/app/ish-shell/id1436902243) |
| **USB 控制** · 看畫面、滑動、點擊、輸入 | [下載 USB ZIP](https://github.com/owen201913-cmd/iphone-use/raw/refs/heads/main/downloads/iphone-use-usb.zip) | [USB 安裝指南](docs/usb.md) |

將選好的 ZIP 解壓到打算長期保留的目錄。每包都有自己的 `README.md` 與 `install.ps1`，安裝不同包可並存。iSH 的背景批次是額外選項，使用一般終端只需 App Store 版。[背景版下載與簽署](docs/ish.md#選用背景工作)

| 你打算怎麼用？ | 從這裡開始 |
| --- | --- |
| 在 Codex 用現成外掛 | 解壓選好的 ZIP → 在含 `install.ps1` 的目錄執行 `.\install.ps1` → 依包內 `README.md` 啟用並配對 → 開新對話。 |
| 在 Claude Code、Claude Desktop、VS Code 或其他本機 MCP 用戶端使用 | 解壓同一份 ZIP → 安裝所選功能的依賴 → 把 `server.mjs` 加到你的 AI。[其他 AI 連接教學](docs/MCP.md) |
| 改程式後製作自己的外掛 ZIP | 取得完整原始碼 → 修改、測試、打包 → 驗證三個獨立下載檔。[重新打包外掛](docs/guide.md#重新打包外掛) |

## Windows 快速開始

單功能下載請依上方對應指南安裝。如果要開發外掛，或希望用同一個外掛管理多項功能，再[下載完整原始碼](https://github.com/owen201913-cmd/iphone-use/archive/refs/heads/main.zip)或使用 Git：

```powershell
git clone https://github.com/owen201913-cmd/iphone-use.git
cd iphone-use
```

在含 `install.ps1` 的目錄開啟 PowerShell，**從下表選一行**。iSH 或直接 USB 操作還需 [Python for Windows](https://www.python.org/downloads/windows/)（含 `py.exe`，已測 3.14）。Windows 的 iPhone USB 裝置服務可由 [Apple Devices](https://apps.microsoft.com/detail/9np83lwlpz9k) 提供。

| 組合 | PowerShell 安裝指令 |
| --- | --- |
| 只用 Pinky | `.\install.ps1 -Features Pinky` |
| 只用 iSH Shell 或 iSH Workspace | `.\install.ps1 -Features Ish` |
| 同時用 Pinky 與 iSH | `.\install.ps1 -Features Pinky,Ish` |
| 只用直接 USB 畫面與手勢 | `.\install.ps1 -Features Usb` |
| 三種都用 | `.\install.ps1` |

接著執行 `npm run setup -- enable`，照所選功能的指南完成配對，再開一個新的 Codex 對話。想加減功能時，以新的組合重跑安裝即可，已有的配對資料會保留。`npm run setup -- doctor` 可查看所選功能的本機設定。[完整工具清單與排錯](docs/guide.md)

## 真機畫面與操作

1. 用 USB 接上一支已解鎖的 iPhone，在手機上信任自己的電腦。依裝置要求啟用開發者模式與相關權限。
2. 在專案執行 `npm run setup -- usb`，把目前唯一連接的 USB 裝置登錄到這份外掛。
3. 在 Codex 說「用 Iphone use (Standalone) 看我的手機畫面」。觀察會回傳 PNG 和 observationId。後續點擊用同一畫面的座標。中文貼上會取代手機剪貼簿。

USB 畫面後端使用 iOS 17.4 起提供的 CoreDeviceProxy。手機還須提供個別動作使用的擷取、鏡像或輸入服務，支援情況以真機結果為準。只要前景操作，可以先略過下方兩種選用後端。

| 工具 | 功能 |
| --- | --- |
| `iphone_screen` | 看目前畫面，或憑觀察 ID 取回同一張圖。 |
| `iphone_usb` | USB 狀態、截圖、啟動 App、點擊、長按、滑動、雙指手勢、輸入、貼上、按鍵和操作回執。 |
| `pinky` | 查詢上游工具、依名稱定位分頁、執行批次、查操作結果及延遲。由 Pinky 管理手機授權及接管。 |
| `iphone_workspace` | 在 iSH 的工作目錄讀檔、改程式、跑測試，或提交手機端確認的背景批次，等候、取消等候和查結果。 |
| `iphone_receipt` | 讀取背景工作的狀態、結束碼與輸出。 |

手機輸入使用新的 requestId；結果不確定時，用原 ID 查回執。已切換畫面時先重新觀察。每次只用一個控制工具操作同一支手機。

## 選用 Pinky

[官方下載、各 iOS 版本的手機端需求、Windows 安裝與第一次連線](docs/pinky.md)

## 選用 iSH 工作區

[一般 iSH Shell 下載、安裝與配對](docs/ish.md) · [iSH Workspace 背景版下載與簽署](docs/ish.md#選用背景工作)

## 本機資料與停用

完整原始碼版的設定、USB 環境、SSH 身分及回執存於 `%LOCALAPPDATA%\IphoneUseCodex`。可在安裝前設定絕對路徑 `IPHONE_USE_HOME` 來完全隔離測試資料。外掛初次安裝時預設停用手機存取。使用 `npm run setup -- disable` 撤銷存取；使用 `codex plugin remove iphone-use-standalone@iphone-use-local` 移除這份外掛。獨立 ZIP 的設定各自存放於同一根目錄下的 `packages/pinky`、`packages/ish` 或 `packages/usb`。各包的移除指令在對應指南。

## 開發與授權

執行 `npm ci --ignore-scripts`、`npm test` 和 `py -3 -B -m unittest discover -s test -p "test_*.py"`。GitHub 的 `Windows tests` 會跑這些測試並匯入 USB 驅動套件。測試使用模擬裝置、本機 SSH 和測試 IPA。實體手勢、App 簽署和手機背景執行可依[真機驗收步驟](docs/guide.md#真機驗收)測試。[專案授權](LICENSE) · [第三方元件](NOTICE.md)

從修改原始碼到交付 ZIP 的完整指令、輸出位置與驗收方式，見[重新打包外掛](docs/guide.md#重新打包外掛)。
