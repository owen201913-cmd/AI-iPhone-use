import { randomUUID } from 'node:crypto';
import { mkdir, readFile, link, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import ssh2 from 'ssh2';
import { pairingDirectory } from '../../lib/paths.mjs';

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

export async function configure(cmd) {
  const pub = await identity();
  if (cmd === 'identity') { console.log(join(pairingDirectory,'identity.pub')); return; }
  const script = await readFile(new URL('../../ios/workspace-pair.sh',import.meta.url),'utf8');
  console.log(['(', 'set -eu', 'umask 077', "key='"+pub+"'",
    'p=/etc/workspace-authorized.pub', 'auth=/home/ishwork/.ssh/authorized_keys; if [ -e "$auth" ] && ! grep -Fxq "$key" "$auth"; then echo "Other workspace already paired"; exit 1; fi', 'if [ -e "$p" ]; then grep -Fxq "$key" "$p" || { echo "Different pairing exists"; exit 1; }; else printf "%s\\n" "$key" > "$p"; fi',
    script.replaceAll('22483','22482').replaceAll('\r',''), ')'].join('\n')); return;
}
