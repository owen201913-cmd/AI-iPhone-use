# Run code on your iPhone with iSH

**Read files, edit code, and run tests in a Linux workspace on your phone.**<br><br>
The package exposes `iphone_workspace` and `iphone_receipt`. The App Store version of iSH supports foreground work. Building and signing a separate iSH Workspace app is only necessary for the optional background workflow. For Claude or another MCP client, follow [Connect another AI client](MCP.md).

## Pair iSH Shell

1. **On iPhone**, install and open [iSH Shell by Theodore Dubois](https://apps.apple.com/app/ish-shell/id1436902243). [iSH project](https://ish.app/)
2. **On Windows**, [download the iSH package](https://github.com/owen201913-cmd/AI-iPhone-use/raw/refs/heads/main/downloads/iphone-use-ish.zip) and extract it. For Codex, install [Codex CLI](https://developers.openai.com/codex/cli/), [Node.js 22.16 or later](https://nodejs.org/en/download), [Python with the Windows py launcher](https://www.python.org/downloads/windows/), and [Apple Devices](https://apps.microsoft.com/detail/9np83lwlpz9k). Connect one unlocked iPhone over USB and trust the PC.
3. **Install and pair.** Open PowerShell in the folder containing `install.ps1`:

   ```powershell
   .\install.ps1
   node scripts/setup.mjs enable
   node scripts/setup.mjs ish-script
   ```

   Paste the **entire command printed by the last step** into the root shell in iSH on the phone. Press Return and wait for the public host fingerprint beginning with `SHA256:`. The first run downloads OpenSSH. Back on Windows, replace the sample fingerprint with the one shown on the phone:

   ```powershell
   node scripts/pair-ish-usb.mjs "SHA256:<fingerprint shown on your phone>"
   ```

4. **Verify.** Keep iSH in the foreground. In a new AI chat, ask, “Run `pwd` and `printf 'OK\n'` in standard iSH. Show the output and exit code.” Expect `/home/ishwork/workspace`, `OK`, and exit code 0. If that iSH instance already belongs to a different installation, keep its pairing and use a separate app instance for a new pairing.

## Optional background jobs

On iOS 26 or later, iSH Workspace can run a user-confirmed batch after you switch to another app. The standard and background apps each have their own workspace.

1. Open [Build iSH Workspace](https://github.com/owen201913-cmd/AI-iPhone-use/actions/workflows/ios-workspace.yml). Sign in to GitHub, select a successful run and download `iSH-Workspace-unsigned` from **Artifacts**. Extract the IPA. If the artifact has expired, [fork the repository](https://github.com/owen201913-cmd/AI-iPhone-use/fork) and choose **Actions → Build iSH Workspace → Run workflow** in your fork.
2. Enable the package as above. Put `iSH-Workspace.ipa` in the package directory and personalize it with this installation’s public key:

   ```powershell
   $publicKey = node scripts/setup.mjs identity
   py -3 ios/personalize.py iSH-Workspace.ipa iSH-Workspace-Local.ipa $publicKey
   ```

3. Sign the personalized IPA with your own Apple identity and install it on your device. Windows users can use [Sideloadly](https://sideloadly.io/). If the signer changes the bundle ID, repeat the personalization step with `--signed-bundle-id`, the final ID, and a new output filename. If iOS asks you to trust the developer, select your signing identity under **Settings → General → VPN & Device Management**.
4. Open **iSH Workspace** and compare the fingerprint shown there with the one you pass to `node scripts/pair-ish-usb.mjs "SHA256:<background app fingerprint>" --background` on Windows. Ask the AI to submit a batch that prints `OK`. Tap **Start** on the phone, switch apps, and check the receipt using the original job ID. iOS controls the available background time. Keep your private key and personalized IPA local. [Workspace tools and receipts](guide.md#ish-workspace-and-background-jobs)

To remove the Codex plugin, run `codex plugin remove iphone-use-ish@iphone-use-ish-local`.
