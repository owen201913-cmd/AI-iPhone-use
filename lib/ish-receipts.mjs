import {mkdir,readFile,readdir,rename,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

// Store authenticated background script results inside this user's pairing
// directory. A different pinned device gets a different directory.
export function receiptStore(directory, binding) {
  const root = join(directory,'completed',binding);
  const lifetime = 24 * 60 * 60 * 1000;
  return {
    async read(id) {
      try {
        const path = join(root,id+'.json');
        const item = JSON.parse(await readFile(path,'utf8'));
        if (item.expires <= Date.now()) {await rm(path,{force:true}); return;}
        if (item.expires > Date.now() && item.result?.requestId === id &&
            Number.isInteger(item.result.exitCode) && typeof item.result.output === 'string') return item.result;
      } catch { /* A missing or incomplete copy can still be read from the phone. */ }
    },
    async save(result) {
      await mkdir(root,{recursive:true,mode:0o700});
      const path=join(root,result.requestId+'.json');
      const temp=path+'.'+randomUUID()+'.tmp';
      try {
        await writeFile(temp,JSON.stringify({expires:Date.now()+lifetime,result}),{flag:'wx',mode:0o600});
        await rename(temp,path);
      } finally { await rm(temp,{force:true}); }
      const names=(await readdir(root)).filter(n=>/^[a-f0-9-]{36}\.json$/i.test(n));
      const items=await Promise.all(names.map(async n=>{
        try {return {n,expires:JSON.parse(await readFile(join(root,n),'utf8')).expires || 0};}
        catch {return {n,expires:0};}
      }));
      items.sort((a,b)=>b.expires-a.expires);
      await Promise.all(items.filter((item,i)=>i>=64 || item.expires<Date.now()).map(item=>rm(join(root,item.n),{force:true})));
    }
  };
}
