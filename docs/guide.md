# Tools, packaging, and troubleshooting

Choose the [Pinky](pinky.md), [iSH](ish.md), or [direct USB](usb.md) setup guide. Run the commands below in PowerShell from the folder containing `server.mjs`. For clients other than Codex, use the [local MCP instructions](MCP.md).

| Goal | First check |
| --- | --- |
| See or operate a foreground app | Enable access, run `node scripts/setup.mjs usb` with one unlocked, trusted iPhone connected, then ask for the current screen. Expect a PNG and an observation ID. |
| Navigate by control name | Register the Pinky executable and approve the device in Pinky. Ask `pinky` for its upstream tool list, then try changing tabs in Clock. |
| Work with files or code | Follow [standard iSH pairing](ish.md#pair-ish-shell). Run `pwd` and `printf 'OK\n'`. Check the workspace and exit code 0. |
| Finish a batch after switching apps | Pair the [background app](ish.md#optional-background-jobs) on iOS 26 or later. Submit a batch, tap **Start** on the phone, and look up its receipt. |

Use `node scripts/setup.mjs doctor` to check the local access setting, Python environment, executable or device enrollment, and pairing files for the selected features. It works with the phone disconnected. To check the combined Codex installation, run `codex plugin list --marketplace iphone-use-local`. Each ZIP uses its own marketplace name.

## USB screen and input

| Tool or action | Usage |
| --- | --- |
| `iphone_screen` | Get a new PNG, or pass a valid `observationId` to retrieve the same image. Captures preserve aspect ratio and have a maximum long edge of 900 pixels. |
| `iphone_usb` with `status`, `observe`, or `image` | Check device and mirror status, capture a new observation, or retrieve an existing image. |
| `launch` | Open an installed app by bundle ID, for example `com.apple.mobiletimer` for Clock. |
| `tap` or `hold` | Tap or long-press a point on the latest screen. |
| `swipe` or `pinch` | Supply start and end points. For a two-finger gesture, supply both points for the first finger, then both for the second. |
| `type`, `paste`, or `key` | Focus a text field first. `type` sends printable ASCII using the current keyboard layout. `paste` inserts Unicode text and replaces the device clipboard. Each accepts up to 192 string units. The key action supports Enter, Backspace, Escape, Tab, and arrow keys. |
| `receipt` | Look up a previously dispatched USB action by `requestId`. |

Measure coordinates in screenshot pixels from the upper-left corner. Gestures and keyboard input require portrait orientation. Use a new UUID for each new action. Except for app launch, input needs the latest observation ID. When an action returns an updated screen, use it to verify the result and locate the next target.

## Pinky navigation and batches

Use `status` to inspect the bridge, or `tools` to connect and discover which operations the installed Pinky version provides.

- **Named tabs.** `ensure_tab` checks whether a tab is selected and taps only when needed. `navigate_tabs` takes up to ten known tabs within the same app and verifies each selection.
- **Upstream calls.** Use `call` with the names and parameters returned by `tools`. Depending on the version, these include `phone_connect`, `phone_apps`, `phone_launch`, `phone_observe`, `phone_tap`, `phone_type`, `phone_key`, `phone_swipe`, `phone_pinch`, `phone_drag`, `phone_wait_for`, `phone_batch`, `phone_request_approval`, `phone_handoff`, and `phone_release`.
- **Results and handoff.** On a new operation, `includeImage: false` leaves images out of the immediate reply and stores the full result, including images, in that installation’s local `pinky/receipts` directory. To retrieve it after a restart, use `receipt` with the original request ID and omit `includeImage`. With the default setting, raw results are available for up to 32 recent requests in the running server. Status and metadata remain on disk. Receipts created by earlier versions contain only status and metadata on disk. Use `trace` to inspect local latency and `receipt` to check the original request. You can pause or take over in Pinky. When finished, use `phone_release` to release the device and `close` to close the bridge.

## iSH workspace and background jobs

Standard iSH and iSH Workspace each have their own `~/workspace`. In `iphone_workspace`, choose `standard` or `continued` for `environment`. Use `status` to check pairing, `run` to execute shell commands, and `receipt` for a foreground request in the same environment. You can read, edit, and test files in one shell command. Foreground work has a 60-second timeout and a 32 KiB output limit. Available languages and commands depend on what you installed inside iSH.

A `background` job has a one-line title and 1–10 sequential commands, each with a 60-second limit. The user taps **Start** on the phone. Set `waitMs` to wait up to 40 seconds, or `queueUntilOpenMs` to wait for the app to open for up to ten minutes during the current server session. `cancel_wait` cancels a request that is still waiting to be dispatched. After dispatch, pass the original `requestId` to `iphone_receipt` for status, output, and the exit code. [Build, sign, and pair the background app](ish.md#optional-background-jobs)

## Build and verify the plugin ZIPs

To install a published package, use the [downloads](../README.md#downloads). To distribute your own changes, start with the full source tree. You need Git, Node.js 22.16 or later with npm, and Python 3 with the Windows `py` launcher.

1. Clone the repository, or substitute the URL of your fork:

   ```powershell
   git clone https://github.com/owen201913-cmd/AI-iPhone-use.git
   cd AI-iPhone-use
   npm.cmd ci --ignore-scripts
   ```

2. Make your changes. Each ZIP gets its README from `docs/pinky.md`, `docs/ish.md`, or `docs/usb.md`. All three include `docs/MCP.md`. If you add a runtime file, add it to the appropriate file list in `scripts/build-downloads.py`. The builder writes a separate plugin manifest, package configuration, and dependency list for each feature.
3. Run these commands from the repository root. Resolve any failure before continuing:

   ```powershell
   npm.cmd test
   py -3 -B -m unittest discover -s test -p "test_*.py"
   py -3 scripts/build-downloads.py
   py -3 scripts/build-downloads.py --check
   py -3 scripts/test-downloads.py
   ```

4. Collect `downloads/iphone-use-pinky.zip`, `downloads/iphone-use-ish.zip`, and `downloads/iphone-use-usb.zip`. The `--check` command verifies that the committed ZIPs match the source. The final command extracts each package, installs dependencies, starts a real MCP server, and checks its tool list. Use the [device checks](#verify-on-a-real-iphone) for pairing, gestures, and background work.
5. Commit the source changes and rebuilt ZIPs together. To publish from a fork, update the download and workflow links in the guides and point the builder’s `WEB` constant to your fork’s document URL before rebuilding. Users can download just the feature they need.

## Verify on a real iPhone

1. **USB:** Open Clock and capture the screen. Switch to Stopwatch and back, checking the images. To test Unicode paste, confirm that the phone clipboard may be replaced, paste a city name into the city search, and cancel.
2. **Pinky:** Ask for the same named tab twice. The second request should verify that the tab is already selected. Use the direct USB package when the installed Pinky version lacks named-tab navigation.
3. **Standard iSH:** Write a line in a fresh test directory, read it back, and remove the test file. Check its contents and the exit code.
4. **Background iSH:** Record the returned task ID, tap **Start**, switch apps, and check the receipt for that ID. Verify the output and exit code. iOS can interrupt background work.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Codex shows no phone tools | Re-run the installer from its permanent folder with the original feature selection. Check the matching marketplace and open a new chat. |
| `Phone access is disabled` | Run `node scripts/setup.mjs enable` from that package. Use `disable` to revoke access later. |
| USB device missing or unenrolled | Check Apple Devices, use a data-capable cable, unlock the phone, and trust the PC. For initial enrollment, connect one device and run `node scripts/setup.mjs usb`. |
| `observe_again` or `busy` | A stale or consumed observation needs a fresh screen. If busy, wait for the in-progress action to finish. |
| `another_mirror_is_active`, `phone_call_active`, or `rotate_to_portrait_for_input` | Close your other mirroring session, wait for the call to finish, or rotate the phone to portrait, respectively. Observe again. |
| Pinky executable hash changed or Windows blocked it | Register the new official executable after an update. Direct USB is an alternative if Windows blocks that version. |
| `not_paired` or iSH connection timeout | Open the paired iSH instance. Standard uses port 22482 and the background app uses 22483. Check the USB cable and host fingerprint. If SSH stopped after restarting standard iSH, rerun the same `ish-script` output in its root terminal. |
| `awaiting_confirmation` or `uncertain` | Check for a pending job in iSH Workspace. For an uncertain outcome, look up the existing receipt and inspect its result before sending another action. |
