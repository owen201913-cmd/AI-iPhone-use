import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

export const stateRoot = process.env.IPHONE_USE_HOME || join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'IphoneUseCodex');
if (!isAbsolute(stateRoot)) throw Error('IPHONE_USE_HOME must be an absolute path.');
export const usbPython = join(stateRoot, 'venv', 'Scripts', 'python.exe');
