import { randomUUID } from 'node:crypto';
import { mkdir, readFile, link, unlink, rename, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { stateRoot, usbPython, pairingDirectory, packageFeature } from '../lib/paths.mjs';
import { installedFeatures } from '../lib/features.mjs';
import { createPermissions, policyFile } from '../lib/permissions.mjs';

async function writeJson(file, value, replace) {
  const temp = file + '.' + randomUUID() + '.tmp';
  await writeFile(temp, JSON.stringify(value) + '\n', {flag:'wx', mode:0o600});
  try {
    if (replace) await rename(temp, file);
    else {
      try { await link(temp, file); }
      catch (e) {
        if (e.code !== 'EEXIST') throw e;
        const old = JSON.parse(await readFile(file, 'utf8'));
        if (Object.keys(value).some(k => value[k] !== old[k])) throw Error('Another device or executable is already enrolled. Review local configuration first.');
      }
    }
  } finally { await unlink(temp).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'doctor' && !args.length) {
    const features = await installedFeatures();
    const files = [
      [features.has('usb') || features.has('ish'), 'USB Python runtime', usbPython, 'Repeat installation with the same -Features selection'],
      [features.has('usb'), 'USB device registration', join(stateRoot,'iphone-usb-ui','config.json'), 'Connect one unlocked iPhone, then run npm run setup -- usb'],
      [features.has('pinky'), 'Pinky executable registration', join(stateRoot,'pinky.json'), 'Run npm run setup -- pinky "<path to Pinky.exe>"'],
      [features.has('ish'), 'iSH standard pairing', join(pairingDirectory,'device.json'), 'For standard iSH, run ish-script and verify its fingerprint with pair-ish-usb.mjs'],
      [features.has('ish'), 'iSH background pairing', join(pairingDirectory,'device-background.json'), 'For optional background jobs, install iSH Workspace and pair with --background'],
    ];
    const enabled = (await createPermissions().status()).enabled;
    console.log('Phone access: ' + (enabled ? 'enabled' : 'disabled (npm run setup -- enable)'));
    console.log('Selected features: ' + [...features].join(', '));
    console.log('Local files only. Verify the live connection in Codex.');
    for (const [applies,label,file,hint] of files) {
      if (!applies) continue;
      let status = 'present';
      try { await access(file); }
      catch (err) { status = err.code === 'ENOENT' ? 'missing' : 'unreadable'; }
      console.log(label + ': ' + status + (status === 'present' ? '' : ' — ' + hint));
    }
    return;
  }
  if (cmd === 'status' && !args.length) {
    console.log('Phone access', (await createPermissions().status()).enabled ? 'enabled' : 'disabled'); return;
  }
  if (['enable','disable'].includes(cmd) && !args.length) {
    await mkdir(stateRoot,{recursive:true,mode:0o700});
    await writeJson(policyFile, {enabled:cmd === 'enable'}, true);
    console.log('Phone access '+cmd+'d.'); return;
  }
  await createPermissions().require('commands');
  const commands = {usb:['usb',0], pinky:['pinky',1], identity:['ish',0], 'ish-script':['ish',0]};
  const route = Object.hasOwn(commands,cmd) && commands[cmd];
  if (route && args.length === route[1] && (!packageFeature || route[0] === packageFeature)) {
    const {configure} = await import('./configure/' + route[0] + '.mjs');
    return configure(cmd, args, writeJson);
  }
  throw Error('Use: status | doctor | enable | disable | usb | pinky <Pinky.exe> | identity | ish-script');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
