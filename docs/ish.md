# 用 iSH Shell 讀檔、改程式、跑測試

**讓 AI 在 iPhone 的 Linux 工作區讀檔、改碼、跑測試。**<br><br>
這條路徑只需要 iSH。Codex 會列出 `iphone_workspace` 和背景回執工具 `iphone_receipt`。一般終端可直接使用 App Store 版本，簽署與編譯只在選用背景工作時才需要。

下方是 Codex 的安裝流程。使用 Claude Code、Claude Desktop 或其他支援本機 MCP 的 AI，請從[其他 AI 連接教學](MCP.md)開始。

1. **手機下載。** 在 iPhone 開啟 [App Store 的 iSH Shell](https://apps.apple.com/app/ish-shell/id1436902243) 並安裝。開發者為 Theodore Dubois。[iSH 官網](https://ish.app/)
2. **電腦準備。** [下載 iSH 專用 ZIP 並解壓縮](https://github.com/owen201913-cmd/iphone-use/raw/refs/heads/main/downloads/iphone-use-ish.zip)，準備 [Codex CLI](https://developers.openai.com/codex/cli/)、[Node.js 22.16 以上](https://nodejs.org/en/download)、[Python for Windows（含 py 啟動器）](https://www.python.org/downloads/windows/) 和 [Apple Devices](https://apps.microsoft.com/detail/9np83lwlpz9k)。以 USB 接上一支已解鎖並信任這台電腦的 iPhone。
3. **安裝與配對。** 在含 `install.ps1` 的目錄開 PowerShell。一般 iSH 使用 Python 標準函式庫連接 USB，單選時會略過畫面控制用的 Python 套件。

```powershell
.\install.ps1
npm run setup -- enable
node scripts/setup.mjs ish-script
```

把最後一行**產生的整段指令**貼入手機 iSH 的 root 終端，按 Return，等到它顯示 `SHA256:` 開頭的公開主機指紋。第一次要連網下載 OpenSSH。將下面引號內的範例換成手機顯示的完整指紋，在**電腦**執行：

```powershell
node scripts/pair-ish-usb.mjs "SHA256:<手機顯示的指紋>"
```

4. **驗證。** 讓 iSH 保持前景，在新的 Codex 對話說「用一般 iSH 執行 `pwd` 和 `printf 'OK\n'`，顯示輸出和結束碼」。應看到 `/home/ishwork/workspace`、`OK` 和結束碼 0。已與其他外掛配對的 iSH 請保留原配對，改用另一個獨立 App 實例。

## 選用背景工作

希望開始一批工作後切到其他 App，請使用 iOS 26 以上及獨立的 **iSH Workspace**。兩個 App 各有自己的工作目錄。

1. 前往 [Build iSH Workspace 建置和下載頁](https://github.com/owen201913-cmd/iphone-use/actions/workflows/ios-workspace.yml)，選最近成功的執行，在 **Artifacts** 下載 `iSH-Workspace-unsigned` 並解壓縮。下載產物需登入 GitHub。若產物已過期，可 [fork 本專案](https://github.com/owen201913-cmd/iphone-use/fork)，在自己的 fork 開啟 **Actions → Build iSH Workspace → Run workflow**。
2. 完成上面的電腦安裝與 `enable`，把未簽署的 `iSH-Workspace.ipa` 放在專案目錄，於 PowerShell 執行：

```powershell
$publicKey = node scripts/setup.mjs identity
py -3 ios/personalize.py iSH-Workspace.ipa iSH-Workspace-Local.ipa $publicKey
```

3. 使用自己的 Apple 簽署身分把個人化後的 IPA 裝到 iPhone。Windows 可使用 [Sideloadly 官方下載及安裝說明](https://sideloadly.io/)。若簽署工具會在原 Bundle ID 後加識別尾碼，請在上一步加上 `--signed-bundle-id` 與實際 ID，並選一個新的輸出檔名。
4. 打開手機的 **iSH Workspace**，核對它顯示的指紋。電腦執行 `node scripts/pair-ish-usb.mjs "SHA256:<背景版顯示的指紋>" --background`。請 Codex 提交一批輸出 `OK` 的背景工作，在手機按「開始」，切到其他 App，再查同一個任務 ID 的輸出。iOS 管理背景執行時間。[工作區操作與回執](guide.md#ish-工作區與背景工作)

移除本包可執行 `codex plugin remove iphone-use-ish@iphone-use-ish-local`。
