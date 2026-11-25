import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {connectDatabase} from '../server/db.js';
import {createApp} from '../server/app.js';
import {evaluate} from '../server/services/rules.js';
import {testHttp} from './http-fixture.js';
const key='test-only-secret-at-least-16';
test('Reglas limitadas: razones y ausencia no equivalen a seguridad',()=>{
 assert.equal(evaluate('mensaje','URGENTE entrega tu CLÁVE').signal,true);
 assert.equal(evaluate('enlace','https://banc0.example/validar').signal,true);
 assert.equal(evaluate('telefono','+1 202 555 0100').signal,false);
 assert.match(evaluate('mensaje','Taller de lectura el jueves').reasons[0],/no significa seguridad/);
});
test('API real con PGlite en disco: CRUD, errores, cascada y reapertura',async()=>{
 const dir=await mkdtemp(join(process.cwd(),'.test-db-'));
 let db=await connectDatabase({DB_DRIVER:'pglite',PGLITE_PATH:dir});
 await db.exec(await readFile('db/001_schema.sql','utf8'));
 await db.exec(await readFile('db/003_private_summaries.sql','utf8'));
 let server=await testHttp(createApp(db,key));
 async function req(path:string,method='GET',body?:unknown,expect=200){
  const r=await server.request('/api/v1'+path,{method,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=r.status===204?null:await r.json();assert.equal(r.status,expect,JSON.stringify(data));return data;
 }
 try{
  assert.equal((await server.request('/api/v1/analisis')).status,401);
  await req('/analisis','POST',{tipo:'enlace',contenido:'javascript:alert(1)'},422);
  await req('/analisis','POST',{tipo:'mensaje',contenido:'hola',extra:true},422);
  await req('/analisis/not-uuid','GET',undefined,422);
  await req('/analisis?limit=1000','GET',undefined,422);
  const x=(await req('/analisis','POST',{tipo:'mensaje',contenido:'Urgente entrega tu clave'},201)).data;
  assert.equal(x.con_senales,true);assert.equal((await req('/analisis/'+x.id)).data.id,x.id);
  assert.equal((await req('/analisis/'+x.id,'PATCH',{nota:'Revisar con familiar'})).data.nota,'Revisar con familiar');
  const a=(await req('/alertas','POST',{analisis_id:x.id},201)).data;
  await req('/alertas','POST',{analisis_id:x.id},409);
  assert.equal((await req('/alertas/'+a.id,'PATCH',{revisada:true})).data.revisada,true);
  assert.equal((await req('/alertas')).data.length,1);
  await req('/alertas/'+a.id,'PATCH',{},422);
  // Cierre limpio y nueva instancia: el dato no depende de memoria del proceso.
  await server.close();await db.close();
  db=await connectDatabase({DB_DRIVER:'pglite',PGLITE_PATH:dir});
  server=await testHttp(createApp(db,key));
  assert.equal((await req('/analisis/'+x.id)).data.nota,'Revisar con familiar');
  assert.equal((await req('/alertas/'+a.id)).data.revisada,true);
  await req('/alertas/'+a.id,'DELETE',undefined,204);
  await req('/alertas/'+a.id,'GET',undefined,404);
  const a2=(await req('/alertas','POST',{analisis_id:x.id},201)).data;
  await req('/analisis/'+x.id,'DELETE',undefined,204);
  await req('/alertas/'+a2.id,'GET',undefined,404);
  await req('/analisis/'+x.id,'DELETE',undefined,404);
  assert.equal((await req('/analisis')).data.length,0);
  const invalid=await server.request('/api/v1/analisis',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:'{broken'});assert.equal(invalid.status,400);
 }finally{await server.close();await db.close();assert.equal(dirname(resolve(dir)),resolve('.'));await rm(dir,{recursive:true,force:true});}
});

