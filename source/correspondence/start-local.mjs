import { lstat, readFile } from 'node:fs/promises';
import { start } from './server.mjs';

try {
  try{process.loadEnvFile(new URL('./.env',import.meta.url));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!process.env.OPENAI_API_KEY){
    const path=new URL('../../.secrets/openai-api-key.txt',import.meta.url);
    try{
      const stat=await lstat(path);
      if(!stat.isFile()||stat.size>4096||(stat.mode&0o077)!==0)throw Error('Unsafe local API key file permissions');
      const key=(await readFile(path,'utf8')).trim();
      if(!key||/[\s\x00-\x1f]/u.test(key))throw Error('Invalid local API key file');
      process.env.OPENAI_API_KEY=key;
    }catch(e){if(e.code!=='ENOENT')throw e;}
  }
  await start();
}catch{
  console.error('Local startup failed; check private configuration and key-file permissions (chmod 600).');
  process.exitCode=1;
}
