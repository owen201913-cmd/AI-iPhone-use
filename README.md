# Iphone use · Codex

Windows 上的 Codex 本機外掛。Codex 用 stdio 啟動手機工具，USB 後端能看畫面、點擊和打字；Pinky 和 iSH 是可分別選用的功能。外掛名稱為 **Iphone use (Standalone)**，識別碼為 `iphone-use-standalone`。

## 先選你想用的功能

同一個 Codex 外掛可以單選或組合安裝。新開的 Codex 對話只會列出所選功能的工具。

| 想做的事 | 下載 | 安裝和啟用 |
| --- | --- | --- |
| **Pinky** · 依名稱點選、切換分頁、批次操作 | 電腦：[Pinky 官方 Windows 下載](https://github.com/DIYgod/pinky/releases/latest) | [只安裝 Pinky，含手機配對與驗證](docs/pinky.md) |
| **iSH Shell** · 讀寫工作區檔案、改程式、跑測試 | 手機：[iSH Shell App Store](https://apps.apple.com/app/ish-shell/id1436902243) | [只安裝 iSH Shell，含 USB 配對與驗證](docs/ish.md) |
| **USB 畫面與手勢** · 直接看畫面、點擊、滑動、輸入 | 電腦：[Apple Devices](https://apps.microsoft.com/detail/9np83lwlpz9k) | [直接 USB 操作](#真機畫面與操作) |
| **iSH 背景批次** · 執行已開始的工作時切換 App | [iSH Workspace 建置與下載](https://github.com/owen201913-cmd/iphone-use/actions/workflows/ios-workspace.yml) | [背景版安裝、簽署與配對](docs/ish.md#選用背景工作) |

## Windows 快速開始

先安裝 [Codex CLI](https://developers.openai.com/codex/cli/) 和 [Node.js 22.16 以上](https://nodejs.org/en/download)，確認 PowerShell 能執行 `codex plugin --help`、`node -v` 及 `npm.cmd -v`。[下載本外掛 ZIP](https://github.com/owen201913-cmd/iphone-use/archive/refs/heads/main.zip) 並解壓縮到打算保留的位置，或用 Git 下載：

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

每個 Windows 使用者的設定、USB 環境、SSH 身分及回執存於 `%LOCALAPPDATA%\IphoneUseCodex`。可在安裝前設定絕對路徑 `IPHONE_USE_HOME` 來完全隔離測試資料。外掛初次安裝時預設停用手機存取。使用 `npm run setup -- disable` 撤銷存取；使用 `codex plugin remove iphone-use-standalone@iphone-use-local` 移除這份外掛。保留專案目錄與個人狀態在你自己的電腦上。

## 開發與授權

執行 `npm ci --ignore-scripts`、`npm test` 和 `py -3 -B -m unittest discover -s test -p "test_*.py"`。GitHub 的 `Windows tests` 會跑這些測試並匯入 USB 驅動套件。測試使用模擬裝置、本機 SSH 和測試 IPA。實體手勢、App 簽署和手機背景執行可依[真機驗收步驟](docs/guide.md#真機驗收)測試。[專案授權](LICENSE) · [第三方元件](NOTICE.md)
