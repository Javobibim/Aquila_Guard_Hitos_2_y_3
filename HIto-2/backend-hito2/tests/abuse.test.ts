import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer, type Server} from 'node:http';
import {Duplex} from 'node:stream';
import {gzipSync} from 'node:zlib';
import {createApp} from '../server/app.js';
import type {Database} from '../server/db.js';

const key='local-test-key-for-abuse';
const database=(query:Database['query']):Database=>({query,async exec(){},async close(){}});

// Feed the real HTTP parser without opening a network port.
function request(server:Server, {route='/api/v1/analisis', key:auth=key, body, headers=''}:{route?:string; key?:string; body?:Buffer; headers?:string}={}) {
 return new Promise<string>((resolve,reject)=>{
  const output:Buffer[]=[];
  const socket=new Duplex({
   read(){},
   write(chunk,_encoding,callback){output.push(Buffer.from(chunk));callback();}
  });
  Object.assign(socket,{destroySoon:()=>socket.end()});
  socket.once('error',reject);
  socket.once('finish',()=>{socket.destroy();resolve(Buffer.concat(output).toString());});
  server.emit('connection',socket);
  socket.push(Buffer.from(
   (body?'POST ':'GET ')+route+' HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n'
   +(auth?'Authorization: Bearer '+auth+'\r\n':'')
   +(body?'Content-Type: application/json\r\nContent-Length: '+body.length+'\r\n':'')
   +headers+'\r\n'
  ));
  if(body)socket.push(body);
 });
}

test('60 solicitudes autenticadas por minuto, las anónimas no consumen ese cupo',async()=>{
 let queries=0;
 const db=database(async()=>{queries++;return {rows:[]};});
 const server=createServer(createApp(db,key));
 for(let n=0;n<65;n++)assert.match(await request(server,{key:''}),/^HTTP\/1\.1 401/);
 for(let n=0;n<60;n++)assert.match(await request(server),/^HTTP\/1\.1 200/);
 const limited=await request(server);
 assert.match(limited,/^HTTP\/1\.1 429/);
 assert.match(limited,/\r\nRetry-After: [1-9]\d*\r\n/i);
 assert.equal(queries,60);
});

test('el límite simultáneo se aplica antes de la base de datos y libera el cupo al responder',async()=>{
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 let queries=0;
 const db=database(async()=>{queries++;await gate;return {rows:[]};});
 const server=createServer(createApp(db,key));
 const pending=Array.from({length:8},()=>request(server));
 try {
  const rejected=await request(server);
  assert.match(rejected,/^HTTP\/1\.1 429/);
  assert.equal(queries,8);
 }finally{release();}
 for(const response of await Promise.all(pending))assert.match(response,/^HTTP\/1\.1 200/);
 assert.match(await request(server),/^HTTP\/1\.1 200/);
});

test('rechaza cuerpos comprimidos y tamaños excesivos antes de consultar la base',async()=>{
 const db=database(async()=>{throw Error('No debe llegar a la base');});
 const server=createServer(createApp(db,key));
 const compressed=await request(server,{body:gzipSync('{}'),headers:'Content-Encoding: gzip\r\n'});
 assert.match(compressed,/^HTTP\/1\.1 415/);
 const large=await request(server,{body:Buffer.alloc(263_000,32)});
 assert.match(large,/^HTTP\/1\.1 413/);
});
