# Control iPhone apps with Pinky

**Find controls by name and navigate your iPhone with Pinky.**<br><br>
Use this Windows package for visual observations, named tabs, and batches of actions. It exposes one tool, `pinky`. The package requires Pinky on your PC. For Claude or another local MCP client, follow [Connect another AI client](MCP.md).

1. **Install Pinky.** Open the [official Pinky release](https://github.com/DIYgod/pinky/releases/latest) and select the Windows installer under **Assets** (the x64 filename includes `amd64.exe`). Windows also needs [Apple Devices](https://apps.microsoft.com/detail/9np83lwlpz9k) or an upstream-supported iTunes installation for USB device discovery.
2. **Pair the phone.** Connect it by USB, unlock it, trust the PC, and select **Add phone → iPhone** in Pinky. On iOS 17.4–26, upstream documents a one-time Mac and Xcode installation for full touch control. For iOS 27 and later, check its helper-free setup and the requirements for your device. [Pinky pairing instructions](https://github.com/DIYgod/pinky#get-started)
3. **Connect to Codex.** [Download the Pinky package](https://github.com/owen201913-cmd/AI-iPhone-use/raw/refs/heads/main/downloads/iphone-use-pinky.zip) and extract it to a permanent folder. Install [Codex CLI](https://developers.openai.com/codex/cli/) and [Node.js 22.16 or later](https://nodejs.org/en/download). Open PowerShell in the folder containing `install.ps1`. Replace the sample executable path with the actual location:

   ```powershell
   .\install.ps1
   node scripts/setup.mjs enable
   node scripts/setup.mjs pinky "C:\Path\To\Pinky.exe"
   ```

4. **Verify the connection.** In a new Codex chat, ask, “Use Pinky to list the tools provided by this version.” Then ask it to observe your phone and respond to Pinky’s authorization prompt. After updating Pinky, rerun the final setup command to register the new executable.

If your iOS version needs a helper you cannot install, see [direct USB control](../README.md#downloads). For supported actions, see [Pinky navigation and batches](guide.md#pinky-navigation-and-batches). To remove this Codex plugin, run `codex plugin remove iphone-use-pinky@iphone-use-pinky-local`.
