# 讓其他 AI 連接 iPhone

**在接著手機的 Windows 電腦上，讓你選的 AI 呼叫同一套手機工具。**<br><br>
Claude Code、Claude Desktop 和 VS Code Copilot 都可以啟動本機 MCP 伺服器。每個功能 ZIP 都有自己的 `server.mjs`。只接受遠端 HTTPS 網址的聊天服務需要另外部署有驗證的遠端 MCP 服務；這些 ZIP 提供的是本機 stdio 入口。

## 1. 準備一個功能包

從[專案首頁](https://github.com/owen201913-cmd/iphone-use#下載你要的功能)選 Pinky、iSH 或 USB，解壓到固定目錄。從含 `server.mjs` 的那一層開 PowerShell。準備好 Node.js 22.16 以上，並依包內 README 安裝手機元件與 Apple 裝置服務。若這一包已在同一個 Windows 帳號下安裝、啟用並配對，可直接進入第 2 步。

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
```

**選 Pinky** 可直接跳到下方的啟用指令。**選 iSH 或 USB** 請先安裝含 `py` 的 Windows Python，再執行下列指令。它會從該包取得正確的 Python 環境路徑。只有 USB 包含需要額外安裝的 `requirements.txt`。

```powershell
$usbPython = node --input-type=module -e "import {usbPython} from './lib/paths.mjs'; console.log(usbPython)"
if (!(Test-Path -LiteralPath $usbPython)) {
    py -3 -m venv (Split-Path -Parent (Split-Path -Parent $usbPython))
}
if (Test-Path -LiteralPath .\requirements.txt) {
    & $usbPython -I -m pip install --disable-pip-version-check -r requirements.txt
}
```

接著啟用並依表格完成手機配對。以上指令可在沒有安裝 Codex 的電腦執行。

```powershell
node scripts/setup.mjs enable
```

| 下載的包 | 第一次配對 | 連接成功後可用的工具 |
| --- | --- | --- |
| Pinky | 在 Pinky 配對手機，執行 `node scripts/setup.mjs pinky "C:\Path\To\Pinky.exe"`，換成實際執行檔路徑。 | `pinky` |
| iSH | 執行 `node scripts/setup.mjs ish-script`，將輸出貼到手機的 iSH。依包內 README 核對主機指紋，再執行 `node scripts/pair-ish-usb.mjs "SHA256:<手機上的指紋>"`。 | `iphone_workspace`、`iphone_receipt` |
| USB | 接上一支已解鎖、已信任電腦的 iPhone，執行 `node scripts/setup.mjs usb`。 | `iphone_screen`、`iphone_usb` |

## 2. 連到你的 AI

在同一個 PowerShell 執行下面四行。這些值取自剛解壓的 ZIP，資料夾名稱含空格也能使用。

```powershell
$nodeExe = (Get-Command node.exe).Source
$serverFile = (Resolve-Path -LiteralPath .\server.mjs).Path
$serverName = 'iphone-use-' + (Get-Content .\package.json -Raw | ConvertFrom-Json).iphoneUseFeature
$stateBase = if ($env:IPHONE_USE_HOME) { $env:IPHONE_USE_HOME } else { Join-Path $env:LOCALAPPDATA 'IphoneUseCodex' }
```

### Claude Code

在同一個 PowerShell 註冊這包並檢查連線。`--scope user` 讓這個 Windows 使用者在各個專案都能使用它。

```powershell
$claude = (Get-Command claude.exe,claude.cmd -ErrorAction SilentlyContinue | Select-Object -First 1).Source
& $claude mcp add --scope user --env "IPHONE_USE_HOME=$stateBase" --transport stdio $serverName -- $nodeExe $serverFile
& $claude mcp get $serverName
```

看到 `Connected` 後，在 Claude Code 輸入 `/mcp` 可查看工具。若之後移動了解壓目錄，先用 `& $claude mcp remove --scope user $serverName` 移除舊項，再從新目錄重做第 2 步。[Claude Code 官方說明](https://code.claude.com/docs/en/mcp)

### Claude Desktop

在同一個 PowerShell 產生符合你電腦路徑的 JSON。這段只把設定印在畫面上。

```powershell
$entry = @{ command = $nodeExe; args = @($serverFile); env = @{ IPHONE_USE_HOME = $stateBase } }
@{ mcpServers = @{ $serverName = $entry } } | ConvertTo-Json -Depth 6
```

打開 Claude Desktop 的 **Settings → Developer → Edit Config**。空白設定可以貼入整段 JSON；已有其他伺服器時，把剛產生的 `iphone-use-…` 項目合併到現有 `mcpServers`。儲存、完全結束再重開 Claude Desktop，在工具選單查看。[本機 MCP 設定說明](https://modelcontextprotocol.io/docs/develop/connect-local-servers)

### VS Code Copilot 與其他本機 MCP 用戶端

在接手機的 Windows 本機開啟 VS Code 專案，於命令選擇區執行 **MCP: Add Server**，選 **Command (stdio)**。下列一行會印出可貼到「啟動命令」欄位的完整命令，包含路徑引號。伺服器名稱可用 `$serverName` 顯示的值。[VS Code 官方說明](https://code.visualstudio.com/docs/agent-customization/mcp-servers)

```powershell
'"{0}" "{1}"' -f $nodeExe, $serverFile
```

其他用戶端若分欄設定，選 `stdio`，`command` 填 `$nodeExe` 的值，`args` 填一個元素，即 `$serverFile` 的完整路徑。若安裝時自訂了資料目錄，請在用戶端的伺服器環境變數中將 `IPHONE_USE_HOME` 設為同一個 `$stateBase`。每加入另一個功能包，就在那一包的目錄重做上述步驟，使用各自的名稱。

## 3. 驗證第一次工具呼叫

| 功能 | 在 AI 對話中說 | 怎麼確認 |
| --- | --- | --- |
| Pinky | 「用 Pinky 列出這個版本的手機工具。」 | 展開 `pinky` 工具回傳，確認有上游工具清單。 |
| iSH | 「在一般 iSH 工作區執行 `pwd`，顯示輸出和結束碼。」 | 保持 iSH 在前景，回傳應包含工作目錄及結束碼 0。 |
| USB | 「用 iphone_screen 看手機現在的畫面。」 | 工具應回傳 PNG 與觀察 ID。要讓模型辨識畫面，用戶端與模型都要支援 MCP 圖片結果。 |

工具清單為空時，先核對伺服器路徑和選用的 ZIP。工具已列出但手機沒有回應時，在功能包目錄執行 `node scripts/setup.mjs doctor`，再檢查手機配對與授權。同一支手機一次交給一個用戶端操作。要撤銷這包的手機存取，執行 `node scripts/setup.mjs disable`。
