import {readFile} from 'node:fs/promises';import {parseEnv} from 'node:util';import {fileURLToPath} from 'node:url';import path from 'node:path';import readline from 'node:readline/promises';
import {randomUUID} from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url));
let cfg,origin,rl;
let analysis='',alert='';
async function localFetch(route,options={}){
 try{return await fetch(origin+route,{...options,signal:AbortSignal.timeout(8000)});}
 catch(error){
  const code=error.cause?.code;
  if(code==='ECONNREFUSED')throw Error('El servidor no está escuchando en '+origin+'. Abre Iniciar_Servidor.cmd y espera el mensaje «Listo». Deja esa ventana abierta.');
  if(code==='EACCES'||code==='EPERM')throw Error('Este entorno bloqueó la conexión local a '+origin+'. Ejecuta los dos archivos .cmd directamente en Windows.');
  if(error.name==='TimeoutError'||code==='ETIMEDOUT')throw Error('El servidor local no respondió a tiempo. Revisa la ventana de Iniciar_Servidor.cmd.');
  throw Error('No se pudo contactar al servidor en '+origin+'. Revisa la ventana de Iniciar_Servidor.cmd.');
 }
}
async function checkServer(){
 const response=await localFetch('/health');
 if(!response.ok)throw Error('El servidor local todavía no tiene la base lista (HTTP '+response.status+'). Revisa la ventana de Iniciar_Servidor.cmd.');
 if(response.headers.get('X-Aquila-API-Revision')!=='summaries-v1')throw Error('El puerto está ocupado por otra aplicación o por una versión anterior. Cierra el servidor anterior y vuelve a abrir Iniciar_Servidor.cmd.');
 const authorized=await localFetch('/api/v1/analisis?limit=1',{headers:{Authorization:'Bearer '+cfg.API_KEY}});
 await authorized.body?.cancel();
 if(authorized.status===401)throw Error('La clave local y el servidor abierto no coinciden. Cierra el servidor anterior y abre Iniciar_Servidor.cmd desde esta misma carpeta.');
 if(!authorized.ok)throw Error('La API local respondió HTTP '+authorized.status+'. Revisa la ventana de Iniciar_Servidor.cmd.');
}
async function request(method,route,body,expected,idempotencyKey){
 if(rl)await rl.question('\nEnter para ejecutar '+method+' '+route+' ');
 const res=await localFetch('/api/v1'+route,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+cfg.API_KEY,...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const data=res.status===204?null:await res.json();console.log('\n'+method+' '+route+' -> HTTP '+res.status);
 if(res.status!==expected)throw Error('Se esperaba HTTP '+expected+'. '+JSON.stringify(data));
 if(data?.data&&!Array.isArray(data.data)){const d=data.data;console.log(JSON.stringify({id:d.id,tipo:d.tipo,titulo:d.titulo,con_senales:d.con_senales,version_reglas:d.version_reglas,analisis_id:d.analisis_id,revisada:d.revisada,nota:d.nota,creado_en:d.creado_en},null,2));}
 else if(data)console.log(JSON.stringify(data,null,2));else console.log('Registro eliminado; respuesta sin cuerpo.');
 return data;
}
try{
 cfg=parseEnv(await readFile(path.join(root,'.env'),'utf8').catch(()=>{throw Error('Primero abre Iniciar_Servidor.cmd para generar la configuración.');}));
 const port=Number(cfg.PORT||3000);
 if(!['127.0.0.1','localhost','::1'].includes(cfg.HOST||'127.0.0.1')||!Number.isInteger(port)||port<1024||port>65535)throw Error('La demostración requiere una configuración local y un puerto válido.');
 origin='http://127.0.0.1:'+port;
 await checkServer();
 if(process.argv.includes('--paso'))rl=readline.createInterface({input:process.stdin,output:process.stdout});
 console.log('Aquila Guard Hito 2: demostración real de API local. La clave no se imprime.');
 const input=await readFile(path.join(root,'examples/correo-con-senales.eml'),'utf8');
 const body={tipo:'correo',contenido:input},retryKey=randomUUID();
 analysis=(await request('POST','/analisis',body,201,retryKey)).data.id;
 const repeated=(await request('POST','/analisis',body,200,retryKey)).data;
 if(repeated.id!==analysis||'contenido' in repeated)throw Error('Falló la prueba de reintento o privacidad.');
 await request('GET','/analisis/'+analysis,undefined,200);
 const note='Comprobado por el equipo con datos ficticios';
 await request('PATCH','/analisis/'+analysis,{nota:note},200);
 const persisted=await request('GET','/analisis/'+analysis,undefined,200);
 if(persisted.data.nota!==note)throw Error('La nota actualizada no se recuperó desde la base de datos.');
 alert=(await request('POST','/alertas',{analisis_id:analysis},201)).data.id;
 await request('GET','/alertas/'+alert,undefined,200);
 await request('PATCH','/alertas/'+alert,{revisada:true,nota:'Leída en la demostración'},200);
 await request('POST','/alertas',{analisis_id:analysis},409);
 await request('DELETE','/alertas/'+alert,undefined,204);alert='';
 await request('DELETE','/analisis/'+analysis,undefined,204);
 await request('GET','/analisis/'+analysis,undefined,404);
 analysis='';
 console.log('\nDemostración completa: CRUD, reintento sin duplicado y persistencia mediante lecturas.');
}catch(e){console.error('Demostración detenida: '+e.message);process.exitCode=1;}
finally{rl?.close();}
