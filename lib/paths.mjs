import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import manifest from '../package.json' with {type:'json'};

export const packageFeature = manifest.iphoneUseFeature;
if (packageFeature !== undefined && !['pinky','ish','usb'].includes(packageFeature)) throw Error('Invalid package feature.');
const base = process.env.IPHONE_USE_HOME || join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'IphoneUseCodex');
if (!isAbsolute(base)) throw Error('IPHONE_USE_HOME must be an absolute path.');
export const stateRoot = packageFeature ? join(base, 'packages', packageFeature) : base;
export const usbPython = join(stateRoot, 'venv', 'Scripts', 'python.exe');
export const pairingDirectory = join(stateRoot, 'ish-workspace');
