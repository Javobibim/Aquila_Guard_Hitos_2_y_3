import {createServer,type RequestListener} from 'node:http';
import {Duplex} from 'node:stream';
import {once} from 'node:events';

export async function testHttp(app:RequestListener) {
 const server=createServer(app);
 if(process.env.AQUILA_HTTP_TCP==='1'){
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const address=server.address();
  if(!address||typeof address==='string')throw Error('No se obtuvo el puerto de prueba.');
  return {
   request:(route:string,options?:RequestInit)=>fetch('http://127.0.0.1:'+address.port+route,options),
   close:()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))
  };
 }
 // Se usa el parser HTTP real con un flujo en memoria.
 function request(route:string,options:RequestInit={}):Promise<Response>{
  return new Promise((resolve,reject)=>{
   const headers=new Headers(options.headers);
   headers.set('Host','localhost');
   headers.set('Connection','close');
   const body=String(options.body??'');
   if(body)headers.set('Content-Length',String(Buffer.byteLength(body)));
   const start=(options.method||'GET')+' '+route+' HTTP/1.1\r\n';
   const head=Array.from(headers,([name,value])=>name+': '+value).join('\r\n');
   const parts:Buffer[]=[];
   const socket=new Duplex({read(){},write(chunk,_encoding,callback){parts.push(Buffer.from(chunk));callback();}});
   Object.assign(socket,{destroySoon:()=>socket.end()});
   socket.once('error',reject);
   socket.once('finish',()=>{
    socket.destroy();
    try{
     const raw=Buffer.concat(parts),boundary=raw.indexOf('\r\n\r\n');
     const [statusLine,...fields]=raw.subarray(0,boundary).toString().split('\r\n');
     const status=Number(statusLine.split(' ')[1]);
     const responseHeaders=new Headers();
     for(const field of fields){const colon=field.indexOf(':');responseHeaders.append(field.slice(0,colon),field.slice(colon+1).trim());}
     resolve(new Response(status===204?null:raw.subarray(boundary+4),{status,headers:responseHeaders}));
    }catch(error){reject(error);}
   });
   server.emit('connection',socket);
   socket.push(start+head+'\r\n\r\n'+body);
  });
 }
 return {request,close:async()=>{}};
}
