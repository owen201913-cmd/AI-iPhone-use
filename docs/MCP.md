# Connect another AI client

**Connect the AI app you already use to your iPhone.**<br><br>
Start with the app that runs the conversation. The same model might run in a desktop agent that can start tools, a cloud service that accepts URLs, or a chat interface with no tool support. Check the app’s settings or developer documentation and choose the matching row.

| What your app offers | How to connect |
| --- | --- |
| “Local MCP”, “stdio”, or fields for a command and arguments | Follow steps 1–3 below. Your app starts the server on the Windows PC connected to the phone. This also works with a hosted model inside a local agent. |
| A locally running model | Load a tool-capable model in an MCP host such as LM Studio, then use the same local setup. For screenshots, select an image-capable model and a host that forwards tool images. |
| A remote MCP connector with an HTTPS URL field | Use an authenticated gateway with a connection to your Windows host. See [URL-only clients](#url-only-clients). |
| An SDK or API with function calling, but no built-in MCP client | Connect the SDK in your own application to this package with the [function-calling adapter example](#connect-a-function-calling-api). |
| A plain chat box with no external tool or connector support | Use the same model in a tool-capable host if the provider makes it available there, or build an application with its tool-calling API. Uploading a ZIP to a conversation does not start a program on the PC. |

## 1. Prepare one package

Choose [Pinky, iSH, or USB](https://github.com/owen201913-cmd/AI-iPhone-use#downloads). Extract the ZIP to a permanent folder and open PowerShell in the directory containing `server.mjs`. Install Node.js 22.16 or later and the device software listed in the package README. If this package is already installed, enabled, and paired under the same Windows account, go straight to step 2.

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
```

**For Pinky**, skip ahead to the enable command. **For iSH or USB**, install Python for Windows with the `py` launcher, then run the following. It creates the Python environment where this package expects it. Only the USB package ships a `requirements.txt`.

```powershell
$usbPython = node --input-type=module -e "import {usbPython} from './lib/paths.mjs'; console.log(usbPython)"
if (!(Test-Path -LiteralPath $usbPython)) {
    py -3 -m venv (Split-Path -Parent (Split-Path -Parent $usbPython))
}
if (Test-Path -LiteralPath .\requirements.txt) {
    & $usbPython -I -m pip install --disable-pip-version-check -r requirements.txt
}
```

Enable access, then pair the phone. These steps work without a Codex installation.

```powershell
node scripts/setup.mjs enable
```

| Package | First-time pairing | Available tools |
| --- | --- | --- |
| Pinky | Pair the phone in Pinky. Run `node scripts/setup.mjs pinky "C:\Path\To\Pinky.exe"` using your actual executable path. | `pinky` |
| iSH | Run `node scripts/setup.mjs ish-script`. Paste its output into iSH on the phone. Compare the public fingerprint and run `node scripts/pair-ish-usb.mjs "SHA256:<phone fingerprint>"` as described in the package README. | `iphone_workspace`, `iphone_receipt` |
| USB | Connect one unlocked iPhone that trusts this computer, then run `node scripts/setup.mjs usb`. | `iphone_screen`, `iphone_usb` |

## 2. Register the server

Run these four lines from the extracted package folder. They resolve the actual paths, including paths with spaces. Then follow the instructions for your client.

```powershell
$nodeExe = (Get-Command node.exe).Source
$serverFile = (Resolve-Path -LiteralPath .\server.mjs).Path
$serverName = 'iphone-use-' + (Get-Content .\package.json -Raw | ConvertFrom-Json).iphoneUseFeature
$stateBase = if ($env:IPHONE_USE_HOME) { $env:IPHONE_USE_HOME } else { Join-Path $env:LOCALAPPDATA 'IphoneUseCodex' }
```

### Use the same configuration in different apps

For apps that accept `mcpServers` JSON, generate one entry with the actual paths from this machine. Run both lines in the same PowerShell window. Merge the new entry into the app’s existing configuration.

```powershell
$entry = @{ command = $nodeExe; args = @($serverFile); env = @{ IPHONE_USE_HOME = $stateBase } }
@{ mcpServers = @{ $serverName = $entry } } | ConvertTo-Json -Depth 6
```

| Client | Where to put the entry |
| --- | --- |
| Cursor | Add it to `.cursor/mcp.json` in a trusted local project, or your personal Cursor MCP configuration. Enable the server for the agent. [Cursor MCP](https://cursor.com/docs/mcp) |
| Gemini CLI | Merge the entry into `mcpServers` in your user or project `settings.json`. Open Gemini CLI and use `/mcp` to inspect the server. [Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server/) |
| LM Studio | In the **Program** sidebar, choose **Install → Edit mcp.json**, merge the entry, then use it in a chat with a tool-capable model. [LM Studio MCP](https://lmstudio.ai/docs/app/mcp) |
| Claude Desktop | Open **Settings → Developer → Edit Config**, merge the entry, save, fully quit Claude Desktop, and reopen it. Check the tools menu. [Local MCP server setup](https://modelcontextprotocol.io/docs/develop/connect-local-servers) |

If the client uses individual fields or a different JSON layout, keep its own wrapper. Select `stdio`, use the value of `$nodeExe` for the executable, the absolute value of `$serverFile` as the **single argument**, and `IPHONE_USE_HOME=$stateBase` in its environment. Each ZIP needs its own server name. A remote agent session runs on another machine unless the client explicitly offers local tool execution.

### Claude Code

In the same PowerShell window, register the package and check its connection. User scope makes it available across your projects on this Windows account.

```powershell
$claude = (Get-Command claude.exe,claude.cmd -ErrorAction SilentlyContinue | Select-Object -First 1).Source
& $claude mcp add --scope user --env "IPHONE_USE_HOME=$stateBase" --transport stdio $serverName -- $nodeExe $serverFile
& $claude mcp get $serverName
```

Expect `Connected`. Open Claude Code and use `/mcp` to inspect the available tools. If you move the package, run `& $claude mcp remove --scope user $serverName`, then repeat step 2 from the new directory. [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp)

### VS Code Copilot

Open a local Windows project in VS Code. In the Command Palette, run **MCP: Add Server** and choose **Command (stdio)**. The line below prints the full launch command with quoted paths. Paste its output into the command field and use the value of `$serverName` as the server ID. [VS Code MCP documentation](https://code.visualstudio.com/docs/agent-customization/mcp-servers)

```powershell
'"{0}" "{1}"' -f $nodeExe, $serverFile
```

If you used a custom data directory, also set `IPHONE_USE_HOME` in the server environment. Repeat from the corresponding directory for each additional package.

## 3. Verify a tool call

| Package | Ask your AI | Check the tool result |
| --- | --- | --- |
| Pinky | “Use Pinky to list the phone tools this version provides.” | Open the `pinky` result and look for the upstream tool list. |
| iSH | “Run `pwd` in standard iSH and show the output and exit code.” | Keep iSH in the foreground and check for the workspace path and exit code 0. |
| USB | “Use iphone_screen to show the current screen.” | Expect a PNG and an observation ID. To interpret the pixels, both the client and its model must support MCP image results. |

If no tools appear, check the server path and selected ZIP. If the tools appear but the phone does not respond, run `node scripts/setup.mjs doctor` from the package directory, then check the device pairing and authorization. Give one client at a time control of the phone. To revoke device access for this package, run `node scripts/setup.mjs disable`.

## URL-only clients

These ZIPs speak MCP over stdio and include no hosted URL. A GitHub link points to source or a download. A local address entered in a cloud connector refers to the connector’s own environment.

1. First verify the chosen package locally. On the phone-connected PC, configure a trusted stdio-to-Streamable-HTTP MCP gateway to launch the same executable, argument, and environment from step 2.
2. Give your cloud client an HTTPS endpoint it can reach. Restrict it to your account with an authentication method supported by the client and gateway. Keep the phone’s existing pairing, approval, and handoff controls. The PC and gateway must be online when a tool runs.
3. In the cloud client, choose its remote MCP connector, enter the gateway’s MCP endpoint, sign in, and run a check from step 3. Image delivery depends on the client. This is a deployment you supply; this repository ships the local server. [Remote MCP connections](https://modelcontextprotocol.io/docs/develop/connect-remote-servers)

## Connect a function-calling API

If you are building your own AI app, your application can act as the MCP client. Run that part of the application on the Windows PC with the phone. The package already installs the Node MCP SDK. To verify the connection before connecting any model, save this example as `check-mcp.mjs` beside `server.mjs` in an extracted ZIP and run `node check-mcp.mjs`.

```js
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const env = getDefaultEnvironment();
if (process.env.IPHONE_USE_HOME) env.IPHONE_USE_HOME = process.env.IPHONE_USE_HOME;
const client = new Client({ name: 'phone-client-example', version: '1.0.0' });
try {
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('./server.mjs', import.meta.url))],
    env
  }));
  const { tools } = await client.listTools();
  console.log('Available tools:', tools.map(tool => tool.name).join(', '));
  const statusTool = tools.find(tool => ['pinky', 'iphone_usb', 'iphone_workspace'].includes(tool.name));
  if (statusTool) {
    const result = await client.callTool({ name: statusTool.name, arguments: { action: 'status' } });
    console.log(JSON.stringify(result.content));
    if (result.isError) process.exitCode = 1;
  }
} finally {
  await client.close();
}
```

In the real application, keep the session open and implement this round trip:

1. Read `listTools()`. Map each tool’s `name`, `description`, and `inputSchema` into your provider’s function declaration format.
2. When the model requests a tool, match its name to the advertised tools, validate the arguments, and apply the user’s action approval. Dispatch the approved call with `client.callTool({ name, arguments: args })`.
3. Send the result back to the model with the provider’s original tool-call ID. Preserve `isError`, text, and structured results. For a screenshot, pass the MCP image bytes and MIME type through the provider’s supported image-input format. A filename or a base64 string in a text message is insufficient for vision.
4. Let the model choose the next step after reading the result. Reuse observation IDs, and query receipts for uncertain inputs before retrying. Stop and close the connection when the task ends.

The example makes no model call. It also works as a connection check for an app backed by a local inference service. Model availability, image support, and any API billing depend on the host and provider you choose.
