# USB screen and touch

**See the screen, tap, swipe, and type on your iPhone over USB.**<br><br>
This Windows package provides `iphone_screen` and `iphone_usb`. It uses CoreDeviceProxy on iOS 17.4 or later. Each action also requires the corresponding capture, mirroring, or input service on the device.

## Connect to Codex

1. [Download USB control](https://github.com/owen201913-cmd/AI-iPhone-use/raw/refs/heads/main/downloads/iphone-use-usb.zip) and extract it to a permanent folder. Install [Codex CLI](https://developers.openai.com/codex/cli/), [Node.js 22.16 or later](https://nodejs.org/en/download), [Python for Windows](https://www.python.org/downloads/windows/) with the `py` launcher, and [Apple Devices](https://apps.microsoft.com/detail/9np83lwlpz9k). For Claude or another local MCP client, follow [Connect another AI client](MCP.md).
2. Connect one iPhone, unlock it, and trust the PC. Follow any device prompts for Developer Mode. In the extracted folder containing `install.ps1`, run:

   ```powershell
   .\install.ps1
   node scripts/setup.mjs enable
   node scripts/setup.mjs usb
   ```

3. Open a new Codex chat and ask, “Use USB to show my iPhone screen.” Then try switching tabs in Clock. Check the image returned after the action. Input uses portrait screenshot coordinates. Typed keys follow the phone’s keyboard layout. To enter non-ASCII text, `paste` uses and replaces the phone clipboard.

Run `node scripts/setup.mjs doctor` to inspect the local installation or `node scripts/setup.mjs disable` to revoke access. To remove the Codex plugin, run `codex plugin remove iphone-use-usb@iphone-use-usb-local`. [Gestures and common errors](guide.md#usb-screen-and-input)
