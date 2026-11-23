import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,unlink,link,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import ssh2 from 'ssh2';
import {pairingDirectory} from '../lib/phone-workspace.mjs';
import {resolveIshDevice,openIshUsb} from '../lib/ish-usb.mjs';
import {createPermissions} from '../lib/permissions.mjs';

// The public fingerprint argument is read from the iPhone by the owner.
const hostKey=process.argv[2];
const continued=process.argv[3]==='--background';
if (process.argv[3] && !continued) throw Error('Unknown pairing target.');
assert.match(hostKey??'',/^SHA256:[A-Za-z0-9+/]{43}$/,'Pass the fingerprint displayed in iSH');
await createPermissions().require('commands');
const {deviceHash}=await resolveIshDevice();
const config={transport:'usb',deviceHash,hostKey};
const path=join(pairingDirectory,continued?'device-background.json':'device.json');
const existing=await readFile(path,'utf8').then(JSON.parse).catch(error=>{
  if(error.code!=='ENOENT')throw error;
  return null;
});
if(existing && (existing.transport!=='usb'||existing.deviceHash!==deviceHash||existing.hostKey!==hostKey))
  throw Error('A different pairing exists. Review it before replacing it.');
const privateKey=await readFile(join(pairingDirectory,'identity'));
const sock=await openIshUsb(deviceHash,continued?22483:22482);
const client=new ssh2.Client();
try {
  await new Promise((resolve,reject)=>{
    client.once('error',reject);client.once('close',()=>reject(Error('Disconnected during pairing')));
    client.once('ready',resolve);
    client.connect({sock,username:'ishwork',privateKey,readyTimeout:5000,
      hostVerifier:key=>'SHA256:'+createHash('sha256').update(key).digest('base64url').replaceAll('-','+').replaceAll('_','/')===hostKey});
  });
  if(!existing){
    const tmp=path+'.'+process.pid+'.tmp';
    await writeFile(tmp,JSON.stringify(config),{flag:'wx'});
    try{await link(tmp,path);}finally{await unlink(tmp);}
  }
  console.log('Paired iSH over USB; the device host key and workspace account were verified.');
}finally{client.end();sock.destroy();}
