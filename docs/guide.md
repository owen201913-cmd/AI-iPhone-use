# 功能、啟用與驗收

首次安裝可直接選 [Pinky 安裝指南](pinky.md)、[iSH Shell 安裝指南](ish.md)，或選擇 [USB 與其他組合](../README.md#windows-快速開始)。所有 `npm` 和 `node` 指令都在專案目錄的 PowerShell 執行。Codex 裡則可直接用中文描述目標。

| 我想做什麼 | 開啟功能 | 怎麼知道成功 |
| --- | --- | --- |
| 看手機畫面、操作前景 App | 插上 USB，解鎖並信任電腦。執行 `npm run setup -- enable` 和 `npm run setup -- usb`。連接一支手機即可。 | 在新的 Codex 對話說「用 Iphone use (Standalone) 看現在畫面」。應看到 PNG 與觀察 ID。 |
| 按控制項名稱找分頁、連續導航 | 依 [Pinky 安裝指南](pinky.md) 安裝並連接裝置。用 `npm run setup -- pinky "C:\Path\To\Pinky.exe"` 登錄實際路徑，在 Pinky 允許工作。 | 請 Codex 列出 `pinky` 的 `tools`。再要求在「時鐘」開啟一個有名稱的分頁。 |
| 讀檔、改程式、跑測試 | 單選 `-Features Ish`，開啟手機的 iSH Shell，執行[終端配對步驟](ish.md)。 | 說「用一般 iSH 執行 `pwd` 和 `printf 'OK\n'`，回報輸出與結束碼」。應在 `~/workspace`，結束碼為 0。 |
| 開始一批工作後，切走使用其他 App | 使用 iOS 26 以上，編譯、個人化、自己簽署並安裝 iSH Workspace，以 `--background` 配對。每批在手機按「開始」。 | 說「用 iSH Workspace 提交一批背景工作，輸出 OK，完成後查回執」。應取得同一個任務 ID 的輸出與結束碼。 |

`npm run setup -- doctor` 可隨時檢查本機存取開關、USB Python、裝置登錄、Pinky 與兩種 iSH 配對檔。這項檢查在手機未連接時也能使用，實際連線請用上表右欄確認。想看 Codex 已安裝的本機外掛，可執行 `codex plugin list --marketplace iphone-use-local`。

## USB 畫面與手勢

| 工具或動作 | 用法 |
| --- | --- |
| `iphone_screen` | 取得新 PNG。附上仍有效的 `observationId` 可重讀同一張 PNG。截圖保留比例，最長邊 900 像素。 |
| `iphone_usb: status / observe / image` | 查已配對裝置與鏡像狀態、觀察新畫面、讀回指定畫面。 |
| `launch` | 用已安裝 App 的 bundle ID 開啟，例如系統時鐘 `com.apple.mobiletimer`。 |
| `tap / hold` | 點一下或長按最新截圖上的一個點。 |
| `swipe / pinch` | 滑動提供起點和終點。雙指手勢依序提供第一指起點、終點，再提供第二指起點、終點。 |
| `type / paste / key` | 聚焦輸入框後，`type` 依手機鍵盤配置輸入可列印 ASCII。中文可用 `paste` 原樣貼上，會取代手機剪貼簿。兩者每次最多 192 個字串單位。`key` 支援 Enter、Backspace、Escape、Tab 和四個方向鍵。 |
| `receipt` | 用原操作的 `requestId` 查詢已送出的 USB 動作。 |

使用截圖像素座標，原點在左上角。USB 手勢和鍵盤輸入需要直向畫面。每個新動作使用一個新 UUID，除了啟動 App，輸入都需要最新觀察 ID。若動作回傳新畫面，直接在該張圖上驗證與定位即可。

## Pinky 導航與批次

`pinky` 支援 `tools`、`status`、`ensure_tab`、`navigate_tabs`、`call`、`receipt`、`trace`、`close`。`status` 只看連線狀態；`tools` 才會連接橋接器並列出本機版本的工具。

- **找分頁。** 告訴 Codex 目標 App 和分頁名稱。`ensure_tab` 若已在該頁會直接驗證，需要切換時才點。`navigate_tabs` 支援同一個 App 最多十個已知分頁，逐步驗證所選分頁。
- **操作裝置。** 可透過 `call` 呼叫上游提供的 `phone_connect`、`phone_apps`、`phone_launch`、`phone_observe`、`phone_tap`、`phone_type`、`phone_key`、`phone_swipe`、`phone_pinch`、`phone_drag`、`phone_wait_for`、`phone_batch`、`phone_request_approval`、`phone_handoff`、`phone_release`。以 `tools` 當次列出的名稱與參數為準。
- **回傳與接管。** `includeImage: false` 可只取狀態，`trace` 讀本機延遲紀錄，`receipt` 查原請求。手機可在 Pinky 暫停或接管。任務結束後可用 `phone_release` 釋放裝置，再以 `close` 關閉橋接連線。

## iSH 工作區與背景工作

一般 iSH 和 iSH Workspace 各自有獨立的 `~/workspace`。`iphone_workspace` 的 `status` 查配對，`run` 在指定環境執行 shell，`receipt` 查回執。`environment` 使用 `standard` 或 `continued`。可把讀檔、編輯及測試放在同一段 shell，讀取輸出和 exit code。每次前景指令限時 60 秒，回傳輸出上限 32 KiB。能執行的語言取決於該 iSH 已安裝的套件。資料範圍是這個 App 的工作區。

背景版的 `background` 接受一行標題和 1–10 段依序執行的指令，每段最多 60 秒。手機顯示標題後由使用者按「開始」。呼叫可附 `waitMs` 最多等 40 秒，或使用 `queueUntilOpenMs` 在目前外掛工作階段中等 App 開啟（最多 10 分鐘）。`cancel_wait` 僅取消尚待派送的等候。工作已派送時依原 `requestId` 用 `iphone_receipt` 查詢。前景作業的回執請用 `iphone_workspace` 的 `receipt` 並選相同環境。

**自行建立背景版。** 在自己的 GitHub fork 開啟 **Actions → Build iSH Workspace → Run workflow**。成功後在該次執行的 **Artifacts** 下載 `iSH-Workspace-unsigned`，解壓縮得到 IPA。依 [背景版下載、個人化與配對指令](ish.md#選用背景工作) 把這台電腦的公鑰寫入本機 IPA。用支援的 Apple 簽署工具安裝到自己的裝置；在 Windows 可於 Sideloadly 選取 iPhone 與個人化後的 IPA，使用自己的 Apple 帳號完成簽署。若 iOS 要求信任開發者，請在「設定 → 一般 → VPN 與裝置管理」選自己的簽署身分。完成後開啟 **iSH Workspace**，讀取該 App 的主機指紋並在電腦配對。私鑰保留在電腦。已個人化 IPA 與簽署資料應留在本機。

## 真機驗收

1. **USB。** 讓 Codex 開啟「時鐘」、回傳畫面、切換「碼錶」再返回。兩張畫面應顯示各自的分頁。在城市搜尋框測中文貼上時，先確認可取代剪貼簿，再貼入「東京」並取消搜尋。
2. **Pinky。** 要求以名稱切換同一分頁兩次。第二次應能確認已選取；若本機 Pinky 不提供分頁語意，使用 USB 畫面操作。
3. **一般 iSH。** 請 Codex 在新建的測試目錄寫入一行文字、讀回比對，再移除該測試檔。確認輸出相符與結束碼 0。
4. **背景 iSH。** 先回傳新的任務 ID，在手機按「開始」，切到別的 App，再查原 ID。以回執輸出與結束碼驗證工作。iOS 可中止工作，請依實際狀態判讀。

## 遇到這些結果時

| 提示或現象 | 處理方式 |
| --- | --- |
| Codex 沒顯示手機工具 | 從保留的專案目錄用原來的 `-Features` 選項重新執行安裝，用 `codex plugin list --marketplace iphone-use-local` 確認安裝，開一個新的 Codex 對話。 |
| `Phone access is disabled` | 在 PowerShell 執行 `npm run setup -- enable`。使用完畢可用 `npm run setup -- disable` 撤銷。 |
| USB 未登錄、配對裝置找不到 | 檢查 Windows 是否能在 Apple Devices 看見手機、資料線是否支援傳輸、手機是否解鎖並信任電腦。第一次登錄時只接一支，執行 `npm run setup -- usb`。 |
| `observe_again` 或 `busy` | 前者表示舊畫面已變動、過期或已用過，使用回傳的新畫面或重新觀察。後者表示裝置上另有操作，等其完成。 |
| `another_mirror_is_active`、`phone_call_active` 或 `rotate_to_portrait_for_input` | 結束自己開的鏡像、等通話結束，或將手機轉回直向，再重新觀察。 |
| Pinky 回報雜湊變動或 Windows 阻擋啟動 | 更新官方版本後重新登錄其執行檔。Windows 阻擋該版本時可使用 USB 路徑。 |
| `not_paired` 或 iSH 連線逾時 | 確認開的是配對時的 iSH 實例。一般版使用 22482，背景版使用 22483。保持 USB 連接，核對手機顯示的指紋。若一般 iSH 重開後 SSH 停止，可在其 root 終端重跑同一份 `ish-script` 輸出。 |
| `awaiting_confirmation` 或 `uncertain` | 前者請在 iSH Workspace 查看待確認工作。後者用同一個 ID 查對應後端的回執與實際結果，避免再次送出可能已執行的輸入。 |
