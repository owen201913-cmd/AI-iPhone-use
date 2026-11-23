import {execFile} from 'node:child_process';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';

const run = promisify(execFile);

// Node can fold a Windows application-control denial into "spawn UNKNOWN".
// Match the pinned binary and this launch attempt before attributing a denial.
export async function pinkyLaunchError(error, hash, started, readEvents = run, wait = delay) {
  if (!/^spawn\b/i.test(error?.message || '') || !/^[a-f0-9]{64}$/i.test(hash)) return error;
  const since = new Date(started - 1500).toISOString();
  const query = "*[System[(EventID=3077) and TimeCreated[@SystemTime >= '" + since +
    "']] and EventData[Data[@Name='SHA256 Flat Hash']='" + hash.toUpperCase() + "']]";
  try {
    for(const pause of [0,300,800,1200]) {
      if(pause) await wait(pause);
      const {stdout} = await readEvents(join(process.env.SystemRoot || 'C:\\Windows','System32','wevtutil.exe'),
        ['qe','Microsoft-Windows-CodeIntegrity/Operational','/q:' + query,'/rd:true','/c:1','/f:xml'],
        {windowsHide:true,timeout:1500,maxBuffer:65536});
      if (/<Event[ >]/.test(stdout)) {
        const smart = /<Data Name=["']PolicyName["']>VerifiedAndReputableDesktop<\/Data>/.test(stdout);
        return new Error('Pinky 啟動被 Windows '+(smart?'智慧型應用程式控制':'應用程式控制原則')+
          '攔截（Code Integrity 3077，已核對執行檔 SHA-256）。本次啟動未派送手機操作。請使用 Windows 信任的官方版本。', {cause:error});
      }
    }
  } catch { /* Missing, restricted, or delayed events do not prove a policy block. */ }
  return error;
}
