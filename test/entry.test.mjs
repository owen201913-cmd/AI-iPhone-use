import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('Codex stdio lists only phone tools, works from an unrelated cwd, and observes local revocation',async () => {
  const dir = await mkdtemp(join(tmpdir(),'iphone-codex-'));
  const client = new Client({name:'codex-smoke',version:'1'});
  const transport = new StdioClientTransport({command:process.execPath,
    args:[fileURLToPath(new URL('../server.mjs',import.meta.url))],cwd:dir,
    env:{IPHONE_USE_HOME:dir},stderr:'ignore'});
  try {
    await client.connect(transport);
    assert.deepEqual((await client.listTools()).tools.map(t=>t.name).sort(),
      ['iphone_receipt','iphone_screen','iphone_usb','iphone_workspace','pinky']);
    const status = () => client.callTool({name:'iphone_workspace',arguments:{action:'status'}});
    assert.equal((await status()).isError,true);
    await writeFile(join(dir,'access.json'),'{"enabled":true}');
    const available = await status();
    assert.equal(available.structuredContent.result.status,'not_paired');
    const pinky=await client.callTool({name:'pinky',arguments:{action:'status'}});
    assert.equal(JSON.parse(pinky.content.at(-1).text).connected,false);
    await writeFile(join(dir,'access.json'),'{"enabled":false}');
    assert.equal((await status()).isError,true);
    const manifest = JSON.parse(await readFile(new URL('../plugin/.codex-plugin/plugin.json',import.meta.url),'utf8'));
    assert.equal(manifest.apps,undefined);
  } finally { await client.close(); await rm(dir,{recursive:true,force:true}); }
});
