import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { stateRoot } from '../../lib/paths.mjs';
import { resolveUsbDevice } from '../../lib/usb-device.mjs';

export async function configure(cmd, args, writeJson) {
  const {deviceHash} = await resolveUsbDevice();
  const dir = join(stateRoot,'iphone-usb-ui');
  await mkdir(dir,{recursive:true,mode:0o700});
  await writeJson(join(dir,'config.json'), {enabled:true,deviceHash}, false);
  console.log('USB device enrolled.'); return;
}
