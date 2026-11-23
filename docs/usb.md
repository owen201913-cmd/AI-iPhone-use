# USB 畫面與手勢

**讓 AI 透過 USB 看畫面、點按、滑動和打字。**<br><br>
這個 Windows 工具包提供 `iphone_screen` 和 `iphone_usb`。使用資料線與手機授權的裝置服務，適用於支援這些服務的 iOS 17.4 以上 iPhone。

下方是 Codex 的安裝流程。使用 Claude Code、Claude Desktop 或其他支援本機 MCP 的 AI，請從[其他 AI 連接教學](MCP.md)開始。

1. [下載 USB 控制 ZIP](https://github.com/owen201913-cmd/iphone-use/raw/refs/heads/main/downloads/iphone-use-usb.zip)，解壓到固定目錄。電腦需要 [Codex CLI](https://developers.openai.com/codex/cli/)、[Node.js 22.16 以上](https://nodejs.org/en/download)、[Python for Windows](https://www.python.org/downloads/windows/)（含 `py.exe`）和 [Apple Devices](https://apps.microsoft.com/detail/9np83lwlpz9k)。
2. 接上一支 iPhone，解鎖並信任電腦，依手機提示啟用開發者模式。在含 `install.ps1` 的目錄開 PowerShell 執行下列指令。

```powershell
.\install.ps1
npm run setup -- enable
npm run setup -- usb
```

3. 開新的 Codex 對話，說「用 USB 看我的手機畫面」，再要求在「時鐘」切換分頁。用動作回傳的畫面確認結果。英文按鍵遵循手機目前的鍵盤配置，使用者同意取代剪貼簿後可透過 `paste` 輸入中文。

執行 `npm run setup -- doctor` 可檢查本包設定。停用用 `npm run setup -- disable`，移除用 `codex plugin remove iphone-use-usb@iphone-use-usb-local`。[完整動作與常見錯誤](guide.md#usb-畫面與手勢)
