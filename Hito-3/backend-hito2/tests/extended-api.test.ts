import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,rm} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import {connectDatabase} from '../server/db.js';import {createApp} from '../server/app.js';
import {testHttp} from './http-fixture.js';
import {RULE_VERSION} from '../server/services/rules.js';
test('migración desde columna antigua, correo MIME grande por HTTP y límites de contrato',async()=>{
 const root=path.resolve(process.cwd()),dir=await mkdtemp(path.join(root,'.test-mail-'));assert.ok(path.resolve(dir).startsWith(root+path.sep));
 const db=await connectDatabase({DB_DRIVER:'pglite',PGLITE_PATH:dir});let server:Awaited<ReturnType<typeof testHttp>>|undefined;
 try{
  await db.exec((await readFile('db/001_schema.sql','utf8')).replace('varchar(50000)','varchar(2000)'));
  const legacyId=randomUUID();
  await db.query("INSERT INTO analisis(id,tipo,contenido,titulo,razones,con_senales,recomendacion,version_reglas,nota) VALUES($1,'correo','TEXTO_FICTICIO_ANTERIOR','Antiguo','[]',false,'','0.6.1','Conservar nota')",[legacyId]);
  for(let n=0;n<2;n++)for(const name of ['002_expand_content.sql','003_private_summaries.sql'])await db.exec(await readFile('db/'+name,'utf8'));
  assert.equal((await db.query('SELECT * FROM analisis WHERE id=$1',[legacyId])).rows[0].nota,'Conservar nota');
  assert.ok(!('contenido' in (await db.query('SELECT * FROM analisis WHERE id=$1',[legacyId])).rows[0]));
  server=await testHttp(createApp(db,'test-extended-api-key-1234'));
  const auth={Authorization:'Bearer test-extended-api-key-1234'};
  async function post(body:unknown,key?:string){return server!.request('/api/v1/analisis',{method:'POST',headers:{...auth,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify(body)});}
  const email='From: PayPal <notificaciones@otro.example>\nReply-To: ayuda@respuesta.example\nContent-Type: text/html\n\n<p>'+('texto '.repeat(600))+'</p><a href="https://consulta.example">https://www.paypal.com</a>';
  const body={tipo:'correo',contenido:email},key=randomUUID();
  const attempts=await Promise.all([post(body,key),post(body,key)]);
  assert.deepEqual(attempts.map(r=>r.status).sort(),[200,201]);
  const saved=(await attempts[0].json()).data,duplicate=(await attempts[1].json()).data;
  assert.equal(duplicate.id,saved.id);assert.equal(saved.version_reglas,RULE_VERSION);assert.equal(saved.resumen,'Revisión de correo');assert.ok(!('contenido' in saved));assert.ok(saved.razones.some((x:string)=>x.includes('texto muestra')));assert.ok(saved.razones.some((x:string)=>x.includes('respuesta.example')));
  assert.equal((await post({...body,contenido:email+' otro'},key)).status,409);
  assert.equal((await post(body,'mal-formada')).status,422);
  const listed=await server.request('/api/v1/analisis',{headers:auth});
  assert.equal(listed.status,200);const listedBody=await listed.json();assert.equal(listedBody.data.length,2);assert.ok(listedBody.data.every((item:object)=>!('contenido' in item)));
  assert.equal((await server.request('/api/v1/analisis/'+saved.id,{method:'DELETE',headers:auth})).status,204);
  assert.equal((await post(body,key)).status,410);
  assert.equal((await post({tipo:'correo',contenido:'x'.repeat(50001)})).status,422);assert.equal((await post({tipo:'mensaje',contenido:'x'.repeat(10001)})).status,422);assert.equal((await post({tipo:'enlace',contenido:'https://example.com/'+ 'x'.repeat(8200)})).status,422);
 }finally{await server?.close();await db.close();assert.equal(path.dirname(path.resolve(dir)),root);await rm(dir,{recursive:true,force:true});}
});
