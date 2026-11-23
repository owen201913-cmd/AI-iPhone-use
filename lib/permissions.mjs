import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stateRoot } from './paths.mjs';

export const policyFile = join(stateRoot, 'access.json');
export function createPermissions() {
  async function status() {
    let enabled = false;
    try { enabled = JSON.parse(await readFile(policyFile, 'utf8')).enabled === true; }
    catch { /* A missing or unreadable owner policy grants no access. */ }
    return { enabled, capabilities: { commands: enabled } };
  }
  return { status, async require(capability) {
    if (capability !== 'commands' || !(await status()).enabled)
      throw Error('Phone access is disabled. The owner can run npm run setup -- enable locally.');
  } };
}
