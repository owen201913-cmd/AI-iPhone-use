# 用 Pinky 操作 iPhone

這條路徑適合看手機畫面、用控制項名稱導航、切換分頁與批次操作。安裝後，Codex 只會列出 `pinky`。手機上不用安裝 iSH，電腦上的外掛也不用 Python。

1. **電腦下載。** 從 [Pinky 官方最新版](https://github.com/DIYgod/pinky/releases/latest) 的 **Assets** 選 Windows 安裝檔（x64 檔名為 `pinky-setup-…-amd64.exe`）。Windows 也需要 [Apple Devices](https://apps.microsoft.com/detail/9np83lwlpz9k) 或上游支援的 iTunes 來辨識 USB 裝置。
2. **手機配對。** 用資料線連接 iPhone，解鎖並信任電腦。在 Pinky 選 **Add phone → iPhone**。需要哪些手機元件取決於 iOS 版本。上游目前指示，iOS 17.4–26 要完整觸控，需用 Mac 和 Xcode 一次安裝 Pinky 的手機端元件；iOS 27 起有免裝手機端的路徑。請按自己的版本查看[官方配對說明](https://github.com/DIYgod/pinky#get-started)。
3. **連到 Codex。** [下載本外掛並解壓縮](https://github.com/owen201913-cmd/iphone-use/archive/refs/heads/main.zip)，準備好 [Codex CLI](https://developers.openai.com/codex/cli/) 和 [Node.js 22.16 以上](https://nodejs.org/en/download)。在含 `install.ps1` 的目錄開 PowerShell，使用安裝後的 `Pinky.exe` 實際路徑：

```powershell
.\install.ps1 -Features Pinky
npm run setup -- enable
npm run setup -- pinky "C:\Path\To\Pinky.exe"
```

4. **驗證。** 開一個新的 Codex 對話，說「用 Pinky 列出這個版本提供的手機工具」。看到工具清單後，再說「用 Pinky 觀察我的 iPhone」，並依 Pinky 的提示核准裝置工作。更新 Pinky 後，重新執行最後一行以登錄新執行檔。

如果只有 Windows，而該 iOS 版本的 Pinky 手機元件無法安裝，也可以選本專案的 [USB 畫面與手勢](../README.md#真機畫面與操作)。[完整 Pinky 操作清單](guide.md#pinky-導航與批次)
