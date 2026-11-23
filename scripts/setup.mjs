import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, link, unlink, rename, writeFile, realpath, lstat, access } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import ssh2 from 'ssh2';
import { stateRoot, usbPython } from '../lib/paths.mjs';
import { createPermissions, policyFile } from '../lib/permissions.mjs';
import { resolveIshDevice } from '../lib/ish-usb.mjs';
import { pairingDirectory } from '../lib/phone-workspace.mjs';

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

async function identity() {
  await mkdir(pairingDirectory, {recursive:true, mode:0o700});
  const file = join(pairingDirectory, 'identity');
  try { await readFile(file); }
  catch(e) {
    if (e.code !== 'ENOENT') throw e;
    const pair = ssh2.utils.generateKeyPairSync('ed25519');
    const tmp = file + '.' + randomUUID() + '.tmp';
    await writeFile(tmp, pair.private, {flag:'wx', mode:0o600});
    try { await link(tmp, file); } catch(e) { if(e.code !== 'EEXIST') throw e; }
    finally { await unlink(tmp); }
  }
  const key = ssh2.utils.parseKey(await readFile(file));
  if (key instanceof Error || key.type !== 'ssh-ed25519') throw Error('Invalid workspace identity.');
  const pub = 'ssh-ed25519 ' + key.getPublicSSH().toString('base64');
  await writeFile(file+'.pub', pub+'\n', {mode:0o600});
  return pub;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'doctor' && !args.length) {
    const files = [
      ['USB Python runtime', usbPython, 'Run install.ps1 without -SkipUsb'],
      ['USB device registration', join(stateRoot,'iphone-usb-ui','config.json'), 'Connect one unlocked iPhone, then run npm run setup -- usb'],
      ['Pinky executable registration', join(stateRoot,'pinky.json'), 'Run npm run setup -- pinky "<path to Pinky.exe>"'],
      ['iSH standard pairing', join(pairingDirectory,'device.json'), 'Run ish-script and verify its fingerprint with pair-ish-usb.mjs'],
      ['iSH background pairing', join(pairingDirectory,'device-background.json'), 'Install the personalized iSH Workspace and pair with --background'],
    ];
    const enabled = (await createPermissions().status()).enabled;
    console.log('Phone access: ' + (enabled ? 'enabled' : 'disabled (npm run setup -- enable)'));
    console.log('Local files only. Verify the live connection in Codex.');
    for (const [label,file,hint] of files) {
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
  if (cmd === 'usb' && !args.length) {
    const {deviceHash} = await resolveIshDevice();
    const dir = join(stateRoot,'iphone-usb-ui');
    await mkdir(dir,{recursive:true,mode:0o700});
    await writeJson(join(dir,'config.json'), {enabled:true,deviceHash}, false);
    console.log('USB device enrolled.'); return;
  }
  if (cmd === 'pinky' && args.length === 1) {
    const path = resolve(args[0]);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || basename(path).toLowerCase() !== 'pinky.exe')
      throw Error('Choose an installed Pinky.exe file.');
    const executable = await realpath(path);
    const sha256 = createHash('sha256').update(await readFile(executable)).digest('hex');
    await writeJson(join(stateRoot,'pinky.json'), {enabled:true,executable,sha256}, true);
    console.log('Approved this Pinky executable and digest.'); return;
  }
  if (['identity','ish-script'].includes(cmd) && !args.length) {
    const pub = await identity();
    if (cmd === 'identity') { console.log(join(pairingDirectory,'identity.pub')); return; }
    const script = await readFile(new URL('../ios/workspace-pair.sh',import.meta.url),'utf8');
    console.log(['(', 'set -eu', 'umask 077', "key='"+pub+"'",
      'p=/etc/workspace-authorized.pub', 'auth=/home/ishwork/.ssh/authorized_keys; if [ -e "$auth" ] && ! grep -Fxq "$key" "$auth"; then echo "Other workspace already paired"; exit 1; fi', 'if [ -e "$p" ]; then grep -Fxq "$key" "$p" || { echo "Different pairing exists"; exit 1; }; else printf "%s\\n" "$key" > "$p"; fi',
      script.replaceAll('22483','22482').replaceAll('\r',''), ')'].join('\n')); return;
  }
  throw Error('Use: status | doctor | enable | disable | usb | pinky <Pinky.exe> | identity | ish-script');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
