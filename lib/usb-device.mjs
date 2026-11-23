import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

import {usbPython} from './paths.mjs';
const run=promisify(execFile);
export async function resolveUsbDevice(expected='') {
  if(expected && !/^[0-9a-f]{64}$/.test(expected)) throw Error('Invalid USB device binding.');
  const script=fileURLToPath(new URL('../scripts/usb-device.py',import.meta.url));
  const {stdout}=await run(usbPython,['-I',script,expected],{timeout:5500,windowsHide:true,maxBuffer:4096});
  const match=/^(\d+) ([a-f0-9]{64})$/.exec(stdout.trim());
  if(!match || (expected && match[2]!==expected))throw Error('Paired USB device unavailable.');
  return {id:Number(match[1]),deviceHash:match[2]};
}
