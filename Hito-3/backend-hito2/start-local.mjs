import {readFile,writeFile,access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {spawn,execFile} from 'node:child_process';
const root=dirname(fileURLToPath(import.meta.url));process.chdir(root);
async function main(){
 const envPath=resolve(root,'.env');
 try{await access(envPath);}catch{
  const key=randomBytes(24).toString('base64url');
  await writeFile(envPath,'HOST=127.0.0.1\nPORT=3000\nDB_DRIVER=pglite\nPGLITE_PATH=.data/aquila\nAPI_KEY='+key+'\n',{flag:'wx'});
 }
 const cfg=parseEnv(await readFile(envPath,'utf8'));
 if(cfg.DB_DRIVER!=='pglite')throw Error('El paquete portátil usa DB_DRIVER=pglite. Para PostgreSQL servidor sigue el README del proyecto.');
 if(!/^[A-Za-z0-9_-]{16,128}$/.test(cfg.API_KEY||''))throw Error('La clave local no tiene un formato válido. Revisa .env.');
 const host=cfg.HOST||'127.0.0.1',port=Number(cfg.PORT||3000);
 if(host!=='127.0.0.1'||!Number.isInteger(port)||port<1024||port>65535)throw Error('Usa HOST=127.0.0.1 y PORT entre 1024 y 65535.');
 const url='http://127.0.0.1:'+port;
 async function live(){try{const r=await fetch(url+'/api/v1/analisis?limit=1',{headers:{Authorization:'Bearer '+cfg.API_KEY},signal:AbortSignal.timeout(700)});return r.ok?(r.headers.get('X-Aquila-API-Revision')==='summaries-v1'?'current':'older'):'none';}catch{return 'none'}}
 function open(){if(process.argv.includes('--no-open'))return;const target=url+'/#acceso='+cfg.API_KEY;if(process.platform==='win32')execFile('rundll32.exe',['url.dll,FileProtocolHandler',target],e=>{if(e)console.log('Abre '+url+' y conecta con la clave guardada en .env.');});else console.log('Abre '+url+' y conecta con la clave de .env.');}
 const running=await live();
 if(running==='older')throw Error('Cierra la ventana del servidor anterior y vuelve a iniciar para aplicar la migración.');
 if(running==='current'){console.log('Aquila Guard ya está abierto.');open();return;}
 const run=file=>new Promise((ok,fail)=>{const child=spawn(process.execPath,['--env-file=.env',file],{cwd:root,env:{...process.env,...cfg},stdio:'inherit',windowsHide:true});child.once('error',fail);child.once('exit',code=>code===0?ok():fail(Error('No se pudo inicializar la base local.')));});
 console.log('Preparando tu base de datos local…');await run('build/migrate.js');
 const child=spawn(process.execPath,['--env-file=.env','build/index.js'],{cwd:root,env:{...process.env,...cfg},stdio:['inherit','inherit','inherit','ipc'],windowsHide:true});
 let ended=false;child.once('exit',()=>{ended=true;if(process.connected)process.disconnect();});
 function stop(){if(child.connected)child.send('shutdown');else child.kill();}
 process.once('SIGINT',stop);process.once('SIGTERM',stop);process.on('message',message=>{if(message==='shutdown')stop();});child.once('error',()=>{ended=true});
 const deadline=Date.now()+60_000;
 while(Date.now()<deadline){
  if(ended)throw Error('El servidor no inició. Comprueba que el puerto '+port+' esté disponible.');
  if(await live()==='current'){console.log('Listo. Mantén esta ventana abierta mientras usas Aquila Guard.');open();return;}
  await new Promise(r=>setTimeout(r,300));
 }
 child.kill();throw Error('No se pudo comprobar el arranque. Conserva .data y consulta el registro de la ventana.');
}
main().catch(e=>{console.error('Aquila Guard: '+e.message);process.exitCode=1});
