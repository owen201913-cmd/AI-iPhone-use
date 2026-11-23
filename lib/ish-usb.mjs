import {createConnection} from 'node:net';
import {once} from 'node:events';
import {resolveUsbDevice} from './usb-device.mjs';
export {resolveUsbDevice as resolveIshDevice};

async function readExact(socket,n) {
  for(;;) {
    const bytes=socket.read(n);
    if(bytes)return bytes;
    if(socket.destroyed || socket.readableEnded)throw Error('USB service disconnected.');
    await new Promise((resolve,reject)=>{
      function done(){cleanup();resolve();}
      function closed(){cleanup();reject(Error('USB service disconnected.'));}
      function cleanup(){socket.off('readable',done);socket.off('close',closed);socket.off('end',closed);socket.off('error',closed);}
      socket.once('readable',done);socket.once('close',closed);socket.once('end',closed);socket.once('error',closed);
    });
  }
}
export async function openIshUsb(hash, port=22482) {
  if (port !== 22482 && port !== 22483) throw Error('Unknown iSH workspace port.');
  const {id}=await resolveUsbDevice(hash);
  // usbmuxd's Connect request specifies the port in network byte order.
  const muxPort=((port&255)<<8)|(port>>>8);
  const data=Buffer.from('<plist version="1.0"><dict><key>MessageType</key><string>Connect</string><key>DeviceID</key><integer>'+id+'</integer><key>PortNumber</key><integer>'+muxPort+'</integer><key>ProgName</key><string>Iphone use</string></dict></plist>');
  const header=Buffer.alloc(16);
  [16+data.length,1,8,1].forEach((n,i)=>header.writeUInt32LE(n,i*4));
  const socket=createConnection({host:'127.0.0.1',port:27015});
  socket.on('error',()=>{});
  const timer=setTimeout(()=>socket.destroy(Error('USB connect timeout.')),4000);
  try {
    await once(socket,'connect');socket.setNoDelay(true);
    socket.write(Buffer.concat([header,data]));
    const reply=await readExact(socket,16),size=reply.readUInt32LE(0);
    if(size<=16 || size>8192 || reply.readUInt32LE(4)!==1 || reply.readUInt32LE(8)!==8 || reply.readUInt32LE(12)!==1)throw Error('Invalid USB connect reply.');
    const result=(await readExact(socket,size-16)).toString('utf8');
    if(!/<key>Number<\/key>\s*<integer>0<\/integer>/.test(result))throw Error('iSH SSH port unavailable. Open iSH and start its paired SSH service.');
    return socket;
  } catch(error){socket.destroy();throw error;}
  finally {clearTimeout(timer);}
}
