import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stateRoot, packageFeature } from './paths.mjs';

const supported = ['usb', 'pinky', 'ish'];

export async function installedFeatures() {
  if (packageFeature) return new Set([packageFeature]);
  let selected;
  try {
    selected = JSON.parse(await readFile(join(stateRoot, 'features.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return new Set(supported); // Existing full installations.
    throw error;
  }
  if (!Array.isArray(selected) || !selected.length || !selected.every(name => supported.includes(name))) {
    throw Error('Invalid features.json. Run install.ps1 with the desired -Features selection.');
  }
  return new Set(selected);
}
