# AI-iPhone-use

**Give your AI a real iPhone to see, tap, and run code on.**<br><br>
Connect an iPhone to a Windows PC and choose the tools your AI needs. USB provides screenshots and touch input, Pinky can find controls by name, and iSH runs shell commands in a workspace on the phone. Each is a separate download that works with Codex or a local MCP client such as Claude Code.

## Downloads

| What you want to do | Windows package | Setup |
| --- | --- | --- |
| Navigate apps by control name and run batches of actions | [Pinky integration for Windows](https://github.com/owen201913-cmd/AI-iPhone-use/releases/latest/download/iphone-use-pinky.zip) | [Pair with Pinky](docs/pinky.md) · [Pinky desktop app](https://github.com/DIYgod/pinky/releases/latest) |
| Edit files and run code inside a Linux shell on iPhone | [iSH integration for Windows](https://github.com/owen201913-cmd/AI-iPhone-use/releases/latest/download/iphone-use-ish.zip) | [Set up iSH](docs/ish.md) · [iSH Shell on the App Store](https://apps.apple.com/app/ish-shell/id1436902243) |
| See the screen, tap, swipe, and type over USB | [USB control for Windows](https://github.com/owen201913-cmd/AI-iPhone-use/releases/latest/download/iphone-use-usb.zip) | [Set up USB control](docs/usb.md) |

## Install a package

1. Extract the ZIP to a folder you intend to keep. Each package has a `README.md` with its own device requirements and pairing instructions.
2. **Codex:** Install [PowerShell 7](https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows) and run `pwsh -File .\install.ps1` in the extracted folder containing `install.ps1`. Run `node scripts/setup.mjs enable`, pair the phone as described in the package README, and start a new Codex chat.
3. **Other AI apps and models:** Open `MCP.md` inside the same ZIP. Choose a setup by capability: local MCP (including Cursor, Gemini CLI, LM Studio, Claude, and VS Code), remote HTTPS connectors, or a function-calling API. Local clients use Node.js and work without a Codex installation. [Choose a connection method](docs/MCP.md)

For a first check, ask the USB tool to show the current screen, Pinky to list its tools, or iSH to run `pwd`. You can install more than one package. Use one client at a time for input on the same phone. The standard App Store version of iSH is sufficient for foreground shell work. [Optional background jobs](docs/ish.md#optional-background-jobs)

If Windows blocks the script, open the downloaded ZIP’s **Properties** in File Explorer, select **Unblock** if shown for this trusted download, and extract it again. For an organization-managed policy, use its approved installation process.

**Updating an existing installation.** Extract the new package to a permanent folder and rerun the installer using the same data directory. Start a new client session. If you configured your MCP client manually, update its `server.mjs` path if the folder changed.

## Work from source

Use a [source ZIP](https://github.com/owen201913-cmd/AI-iPhone-use/archive/refs/heads/main.zip) or clone the repository. The source installer can register several features as one Codex plugin.

```powershell
git clone https://github.com/owen201913-cmd/AI-iPhone-use.git
cd AI-iPhone-use
```

| Features | Run one command inside PowerShell 7 |
| --- | --- |
| Pinky | `.\install.ps1 -Features Pinky` |
| iSH Shell or iSH Workspace | `.\install.ps1 -Features Ish` |
| Pinky and iSH | `.\install.ps1 -Features Pinky,Ish` |
| Direct USB screen and touch | `.\install.ps1 -Features Usb` |
| All three | `.\install.ps1` |

Run `node scripts/setup.mjs enable`, then follow the pairing guide for each feature. Rerun the installer with another selection to change which tools the source installation exposes. If you change code or documentation, follow [Build and verify the plugin ZIPs](docs/guide.md#build-and-verify-the-plugin-zips) before distributing them.

## Tools

| Tool | What it does |
| --- | --- |
| `iphone_screen` | Captures the current screen as a PNG or retrieves the image for an existing observation ID. |
| `iphone_usb` | Gets device status, opens apps, sends touch or keyboard input, and retrieves action receipts. |
| `pinky` | Lists upstream tools, finds tabs, executes batches, and reports results and timing. Pinky manages device authorization and handoff. |
| `iphone_workspace` | Runs commands in iSH, reads and writes workspace files, and submits user-confirmed background jobs. |
| `iphone_receipt` | Reports the state, output, and exit code of a background job. |

Use the latest observation for touch input. If a result is uncertain, check the original request ID before sending more input. For device support, gesture limits, and failure messages, see the [tool reference and troubleshooting guide](docs/guide.md).

## Local data and access

Phone access starts disabled. Use `node scripts/setup.mjs doctor` to check local configuration and `node scripts/setup.mjs disable` to revoke access for this installation. The source installation stores settings, Python environments, SSH identities, and receipts in `%LOCALAPPDATA%\IphoneUseCodex`. Independent ZIPs use `packages/pinky`, `packages/ish`, or `packages/usb` under that directory. Set `IPHONE_USE_HOME` to an absolute path before setup to use a different data directory.

Remove the combined Codex plugin with `codex plugin remove iphone-use-standalone@iphone-use-local`. The package guides include the removal command for each independent plugin.

[Project license](LICENSE) · [Third-party notices](NOTICE.md)
