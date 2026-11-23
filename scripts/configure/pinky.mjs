import { createHash } from 'node:crypto';
import { lstat, realpath, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { stateRoot } from '../../lib/paths.mjs';

export async function configure(cmd, args, writeJson) {
  const path = resolve(args[0]);
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || basename(path).toLowerCase() !== 'pinky.exe')
    throw Error('Choose an installed Pinky.exe file.');
  const executable = await realpath(path);
  const sha256 = createHash('sha256').update(await readFile(executable)).digest('hex');
  await writeJson(join(stateRoot,'pinky.json'), {enabled:true,executable,sha256}, true);
  console.log('Approved this Pinky executable and digest.'); return;
}
