# Iphone use · Codex

Windows 上的 Codex 本機外掛。Codex 用 stdio 啟動手機工具，USB 後端能看畫面、點擊和打字；Pinky 和 iSH 是可分別選用的功能。外掛名稱為 **Iphone use (Standalone)**，識別碼為 `iphone-use-standalone`。

**第一次使用**先走下方 USB 快速開始。只想看畫面、點按或打字，完成這一段就夠了。要用文字名稱找按鈕、在手機上改程式、或切出 App 後跑工作，再依功能配對 Pinky 或 iSH。[完整功能、啟用對照與排錯](docs/guide.md)

## Windows 快速開始

在 PowerShell 執行 `node -v`、`npm.cmd -v`、`codex plugin --help`、`py -3 --version`，可先確認本機指令是否可用。需要安裝時可從官方取得 [Node.js](https://nodejs.org/en/download)、[Codex CLI](https://developers.openai.com/codex/cli/)、[Python for Windows](https://www.python.org/downloads/windows/) 和 [Apple Devices](https://apps.microsoft.com/detail/9np83lwlpz9k)。

準備 Windows、有 `codex plugin` 子命令的 Codex CLI、Node.js 22.16 以上與 npm。USB 功能還需要 Apple Mobile Device USB 服務、Python 與 `py.exe`。已測 Python 3.14。可以用 Git 下載到長期保留的位置：

```powershell
git clone https://github.com/owen201913-cmd/iphone-use.git
cd iphone-use
```

也可以選 GitHub 的 **Code → Download ZIP**，解壓縮後在含 `install.ps1` 的目錄開啟 PowerShell。接著安裝並允許這份外掛存取手機：

```powershell
.\install.ps1
npm run setup -- enable
```

安裝程式會裝入鎖定的 Node 套件、建立 USB 專用 Python 環境，並向 Codex 註冊本機 marketplace 及外掛。開新的 Codex 對話即可看到工具。只使用 Pinky 時可執行 `.\install.ps1 -SkipUsb`。移動專案後，重新執行安裝程式更新路徑。

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

從 [Pinky 官方專案](https://github.com/DIYgod/pinky) 安裝相容且 Windows 允許啟動的版本，再登錄可執行檔。例如：

```powershell
npm run setup -- pinky "C:\Path\To\Pinky.exe"
```

第一次連線在 Pinky 授權；程式更新後需重新登錄執行檔雜湊。USB 工具可獨立運作。每個上游版本提供的語意控制項以 `pinky` 的工具清單為準。

## 選用 iSH 工作區

**一般終端。** 在手機從 [App Store 安裝 iSH Shell](https://apps.apple.com/app/ish-shell/id1436902243) 並開啟。以 `node scripts/setup.mjs ish-script` 產生使用本機公鑰的完整設定，將輸出貼到該 iSH 的 root 終端機。它會安裝 OpenSSH、建立專用帳號、在手機 loopback 的 22482 連接埠啟動服務，並顯示公開主機指紋。核對手機螢幕後在電腦上執行：

```powershell
node scripts/pair-ish-usb.mjs "SHA256:<手機顯示的指紋>"
```

若既有 iSH 已和另一份外掛配對，請保留那份設定；獨立副本可改用另一個 App 實例。一般工作請讓 iSH 保持可用。

**背景批次。** 在 GitHub 手動執行 `Build iSH Workspace`，或依 [.github/workflows/ios-workspace.yml](.github/workflows/ios-workspace.yml) 用 macOS 和 Xcode 編譯。從該次建置下載並解壓縮未簽署的 IPA。在 Windows 本機執行：

```powershell
$publicKey = node scripts/setup.mjs identity
py -3 ios/personalize.py iSH-Workspace.ipa iSH-Workspace-Local.ipa $publicKey
```

使用自己的 Apple 簽署身分安裝本機產出的 IPA。若簽署工具會在原本的 Bundle ID 後面加上識別尾碼，在個人化時以 `--signed-bundle-id` 指定實際 ID，讓背景工作的識別碼一致。開啟 App、核對手機指紋，再執行 `node scripts/pair-ish-usb.mjs "SHA256:<手機顯示的指紋>" --background`。背景功能需 iOS 26 以上與前景確認開始，每批 1–10 步；可用時間由 iOS 管理。編譯使用的 macOS Actions 配額取決於自己的 GitHub 帳戶。

## 本機資料與停用

每個 Windows 使用者的設定、USB 環境、SSH 身分及回執存於 `%LOCALAPPDATA%\IphoneUseCodex`。可在安裝前設定絕對路徑 `IPHONE_USE_HOME` 來完全隔離測試資料。外掛初次安裝時預設停用手機存取。使用 `npm run setup -- disable` 撤銷存取；使用 `codex plugin remove iphone-use-standalone@iphone-use-local` 移除這份外掛。保留專案目錄與個人狀態在你自己的電腦上。

## 開發與授權

執行 `npm ci --ignore-scripts`、`npm test` 和 `py -3 -B -m unittest discover -s test -p "test_*.py"`。GitHub 的 `Windows tests` 會跑這些測試並匯入 USB 驅動套件。測試使用模擬裝置、本機 SSH 和測試 IPA。實體手勢、App 簽署和手機背景執行可依[真機驗收步驟](docs/guide.md#真機驗收)測試。[專案授權](LICENSE) · [第三方元件](NOTICE.md)
