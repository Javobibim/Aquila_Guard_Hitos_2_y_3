import {before,after,test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,deleteDoc,collection,collectionGroup,query,limit,getDocs,serverTimestamp,writeBatch} from 'firebase/firestore';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
let env;
const record=()=>({source:'app',inputType:'enlace',hostname:'example.com',preview:'example.com',classification:'no_match',hasSignals:false,reasons:'',recommendation:'Comprueba por un canal oficial.',ruleVersion:'0.5.0',intelVersion:'2026-10-31',reviewed:false,note:'',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-aquila-guard',firestore:{host:'127.0.0.1',port:8085,rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')}});});
after(async()=>{await env?.cleanup();});
const verified=(uid='owner')=>env.authenticatedContext(uid,{email_verified:true}).firestore();
test('propietario verificado crea, lee, actualiza y borra; los demás no acceden',async()=>{
 const own=verified(),other=verified('other'),unverified=env.authenticatedContext('owner',{email_verified:false}).firestore(),anon=env.unauthenticatedContext().firestore();
 const ref=doc(own,'users/owner/analyses/test');
 await assertSucceeds(setDoc(ref,record()));
 await assertSucceeds(getDoc(ref));
 for(const db of [other,unverified,anon]){
  await assertFails(getDoc(doc(db,ref.path)));
  await assertFails(setDoc(doc(db,'users/owner/analyses/blocked'),record()));
  await assertFails(deleteDoc(doc(db,ref.path)));
  await assertFails(getDocs(query(collection(db,'users/owner/analyses'),limit(50))));
 }
 await delay(2100);
 await assertSucceeds(updateDoc(ref,{reviewed:true,note:'Comprobado',updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(ref,{note:'Ráfaga',updatedAt:serverTimestamp()}));
 assert.equal((await getDoc(ref)).data().note,'Comprobado');
 await assertSucceeds(deleteDoc(ref));
 await assertFails(deleteDoc(ref));
});
test('esquema estricto, tamaño, fecha y campos originales inmutables',async()=>{const db=verified(),ref=doc(db,'users/owner/analyses/schema');for(const extra of [{password:'secret'},{note:'x'.repeat(301)},{reviewed:true},{source:'web'},{createdAt:new Date(0)},{reasons:'x'.repeat(6001)}])await assertFails(setDoc(ref,{...record(),...extra}));await assertSucceeds(setDoc(ref,record()));await delay(2100);await assertFails(updateDoc(ref,{hostname:'otro.example',updatedAt:serverTimestamp()}));await assertFails(updateDoc(ref,{note:'sin fecha de servidor',updatedAt:new Date(0)}));await assertFails(updateDoc(ref,{note:'',updatedAt:serverTimestamp()}));});
test('consultas limitadas, sin escaneo global del historial',async()=>{const db=verified();await assertSucceeds(getDocs(query(collection(db,'users/owner/analyses'),limit(50))));await assertFails(getDocs(collection(db,'users/owner/analyses')));await assertFails(getDocs(query(collection(db,'users/owner/analyses'),limit(51))));await assertFails(getDocs(query(collectionGroup(db,'analyses'),limit(1))));await assertFails(setDoc(doc(db,'reports/public'),{domain:'example.com'}));});
test('teléfonos compartidos, coincidencia exacta con cupo y solo fichas de administración',async()=>{
 const key='a'.repeat(64), otherKey='b'.repeat(64), db=verified('phone-1'), friend=verified('phone-2');
 const unverified=env.authenticatedContext('phone-3',{email_verified:false}).firestore();
 const path='phoneReports/'+key, grant='phoneLookupGrants/phone-1';
 const evidencePath='phoneReportEvidence/'+key,fixture={status:'demo'};
 const evidence={category:'smishing',status:'demo',sourceUrl:'',observedAt:new Date(Date.now()-60_000),expiresAt:new Date(Date.now()+86_400_000)};
 const permit=key=>({key,count:1,windowStartedAt:serverTimestamp(),updatedAt:serverTimestamp()});
 await env.withSecurityRulesDisabled(async ctx=>{
  await setDoc(doc(ctx.firestore(),path),fixture);
  await setDoc(doc(ctx.firestore(),evidencePath),evidence);
 });
 await assertFails(getDoc(doc(db,path)));
 await assertFails(setDoc(doc(unverified,'phoneLookupGrants/phone-3'),permit(key)));
 await assertFails(setDoc(doc(db,grant),{...permit(key),count:21}));
 await assertSucceeds(setDoc(doc(db,grant),permit(key)));
 await assertFails(getDoc(doc(friend,grant)));
 await assertFails(getDoc(doc(db,'phoneReports/'+otherKey)));
 await assertFails(getDocs(collection(db,'phoneReports')));
 await assertFails(setDoc(doc(db,path),fixture));
 await assertFails(updateDoc(doc(db,grant),{key:otherKey,count:2,updatedAt:serverTimestamp()}));
 await assertFails(deleteDoc(doc(db,grant)));
 await assertSucceeds(setDoc(doc(friend,'phoneLookupGrants/phone-2'),permit(key)));
 assert.deepEqual((await assertSucceeds(getDoc(doc(db,path)))).data(),fixture);
 assert.deepEqual((await assertSucceeds(getDoc(doc(friend,path)))).data(),fixture);
 await assertFails(getDoc(doc(db,evidencePath)));
 await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),path),{...fixture,sourceUrl:'https://example.com/privado'}));
 await assertFails(getDoc(doc(db,path)));
 await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),path),fixture));
 const capped=verified('phone-cap'),capPath='phoneLookupGrants/phone-cap';
 await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),capPath),{
  key,count:20,windowStartedAt:new Date(Date.now()-600_000),updatedAt:new Date(Date.now()-60_000)
 }));
 await assertFails(updateDoc(doc(capped,capPath),{key:otherKey,count:21,updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(capped,capPath),permit(key)));
 await assertFails(getDoc(doc(capped,path)));
 await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),evidencePath),{...evidence,expiresAt:new Date(Date.now()-1000)}));
 await assertFails(getDoc(doc(db,path)));
});
test('reportar un teléfono mantiene el número privado y requiere el cupo de envío en el mismo lote',async()=>{
 const owner=verified('tip-owner'),friend=verified('tip-friend');
 const unverified=env.authenticatedContext('tip-owner',{email_verified:false}).firestore();
 const number='+12025550148',key=createHash('sha256').update('aquila-phone-v1:'+number).digest('hex');
 const path='users/tip-owner/phoneTips/'+key,rate='phoneTipLimits/tip-owner';
 const data={category:'impersonation',origin:'caller_id',status:'pending',createdAt:serverTimestamp()};
 const permit={key,updatedAt:serverTimestamp()};
 const send=(db,record=data)=>{
  const batch=writeBatch(db);
  batch.set(doc(db,path),record);
  batch.set(doc(db,rate),permit);
  return batch.commit();
 };
 await assertFails(setDoc(doc(owner,path),data));
 await assertFails(setDoc(doc(owner,rate),permit));
 await assertFails(send(friend));
 await assertFails(send(unverified));
 await assertFails(send(owner,{...data,status:'approved'}));
 await assertFails(send(owner,{...data,number:'+12025550149'}));
 await assertSucceeds(send(owner));
 assert.equal((await assertSucceeds(getDoc(doc(owner,path)))).data().status,'pending');
 assert.equal(Object.hasOwn((await assertSucceeds(getDoc(doc(owner,path)))).data(),'number'),false);
 await assertFails(getDoc(doc(friend,path)));
 await assertFails(getDocs(collection(owner,'users/tip-owner/phoneTips')));
 await assertFails(updateDoc(doc(owner,path),{status:'approved'}));
 await assertFails(setDoc(doc(owner,'phoneReports/'+key),data));
 await assertFails(deleteDoc(doc(owner,rate)));
 const nextNumber='+12025550149',nextKey=createHash('sha256').update('aquila-phone-v1:'+nextNumber).digest('hex');
 const batch=writeBatch(owner);
 batch.set(doc(owner,'users/tip-owner/phoneTips/'+nextKey),data);
 batch.set(doc(owner,rate),{...permit,key:nextKey});
 await assertFails(batch.commit());
});
test('cliente REST real: misma cuenta app/extensión, persistencia, CRUD, cierre y acceso cruzado',async()=>{
 const context=vm.createContext({fetch,AbortController,URLSearchParams,setTimeout,clearTimeout,atob,crypto,TextEncoder});vm.runInContext(await readFile(new URL('../shared/cloud.js',import.meta.url),'utf8'),context);
 function client(fetcher=fetch){const map=new Map();return context.AquilaCloud.create({projectId:'demo-aquila-guard',apiKey:'fake-public-key-1234',testEmulators:true},{get:async k=>map.get(k),set:async(k,v)=>map.set(k,v),remove:async k=>map.delete(k)},fetcher);}
 let appQuery;
 const app=client((url,options)=>{if(url.endsWith(':runQuery'))appQuery={url,options};return fetch(url,options);});
 async function confirmEmail(account,email){
  await account.sendVerification();
  const codes=await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-aquila-guard/oobCodes',{signal:AbortSignal.timeout(5000)});
  assert.ok(codes.ok);
  const code=(await codes.json()).oobCodes.find(x=>x.email===email&&x.requestType==='VERIFY_EMAIL');
  assert.ok(code);
  const applied=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-public-key-1234',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({oobCode:code.oobCode}),signal:AbortSignal.timeout(5000)});
  assert.ok(applied.ok);
  assert.equal((await account.refreshVerification()).verified,true);
 }
 const extension=client(),other=client();const email='qa-'+Date.now()+'@example.test',otherEmail='other-'+Date.now()+'@example.test',password='AquilaTest123';
 await app.signIn(email,password,true);await assert.rejects(app.list(),/Verifica tu correo/);await confirmEmail(app,email);
 await extension.signIn(email,password);
 await other.signIn(otherEmail,password,true);await confirmEmail(other,otherEmail);
 const fixtureKey=await context.AquilaCloud.phoneReportKey('+12025550147');
 await env.withSecurityRulesDisabled(async ctx=>{
  await setDoc(doc(ctx.firestore(),'phoneReports/'+fixtureKey),{status:'demo'});
  await setDoc(doc(ctx.firestore(),'phoneReportEvidence/'+fixtureKey),{
   status:'demo',expiresAt:new Date(Date.now()+86_400_000)
  });
 });
 assert.equal((await app.lookupPhoneReport('+1 202 555 0147')).status,'demo');
 assert.equal((await other.lookupPhoneReport('0012025550147')).status,'demo');
 const data=record();delete data.createdAt;delete data.updatedAt;await app.save('rest-record',data);await app.save('rest-record',data);const items=await extension.list();assert.equal(items.length,1);assert.equal(items[0].hostname,'example.com');assert.ok(Date.parse(items[0].createdAt));await delay(2100);await extension.update('rest-record',true,'Nota desde extensión');assert.equal((await app.list())[0].note,'Nota desde extensión');
 const queryWithOffset=JSON.parse(appQuery.options.body);
 queryWithOffset.structuredQuery.offset=1;
 const response=await fetch(appQuery.url,{...appQuery.options,signal:AbortSignal.timeout(5000),body:JSON.stringify(queryWithOffset)});
 assert.equal(response.status,403);
 assert.equal((await app.get('rest-record')).note,'Nota desde extensión');
 assert.equal((await other.list()).length,0);await assert.rejects(other.update('rest-record',true,'No autorizado'));await app.signOut();await assert.rejects(app.list(),/Inicia sesión/);await extension.remove('rest-record');assert.equal(await extension.get('rest-record'),null);assert.equal((await extension.list()).length,0);
});
