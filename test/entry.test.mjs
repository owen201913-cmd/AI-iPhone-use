import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const groups = {pinky:['pinky'], ish:['iphone_receipt','iphone_workspace'], usb:['iphone_screen','iphone_usb']};
for (const names of [['pinky'], ['ish'], ['usb'], ['pinky','ish']]) {
  test('Codex advertises only the selected tools: ' + names.join(', '), async () => {
    const dir = await mkdtemp(join(tmpdir(), 'iphone-features-'));
    const client = new Client({name:'feature-test',version:'1'});
    try {
      await writeFile(join(dir,'features.json'), JSON.stringify(names));
      const transport = new StdioClientTransport({command:process.execPath,
        args:[fileURLToPath(new URL('../server.mjs',import.meta.url))],cwd:dir,
        env:{IPHONE_USE_HOME:dir},stderr:'ignore'});
      await client.connect(transport);
      const expected = names.flatMap(name => groups[name]).sort();
      assert.deepEqual((await client.listTools()).tools.map(tool => tool.name).sort(), expected);
      const hidden = names.includes('usb') ? 'iphone_workspace' : 'iphone_screen';
      const response = await client.callTool({name:hidden, arguments:{}});
      assert.equal(response.isError,true);
      assert.match(response.content[0].text, /not found|unknown tool/i);
    } finally {
      await client.close();
      await rm(dir,{recursive:true,force:true});
    }
  });
}

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
