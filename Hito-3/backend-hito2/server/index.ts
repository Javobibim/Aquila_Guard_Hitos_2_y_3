import {connectDatabase} from './db.js';
import {createApp} from './app.js';
import {createServer} from 'node:http';
const host=process.env.HOST||'127.0.0.1';
if(!['127.0.0.1','localhost','::1'].includes(host))throw new Error('Esta versión de demostración solo admite acceso local. No desplegar en internet.');
const db=await connectDatabase();
const app=createApp(db,process.env.API_KEY||'');
const server=createServer({headersTimeout:10_000,requestTimeout:20_000,connectionsCheckingInterval:1000},app);
server.listen(Number(process.env.PORT||3000),host,()=>console.log('Aquila Guard: http://'+host+':'+(process.env.PORT||3000)));
async function stop(){server.close(async()=>{await db.close();process.exit(0)});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);

process.on('message',message=>{if(message==='shutdown')stop();});
server.on('error',async(error:any)=>{console.error('No se pudo iniciar el servidor: '+error.code);await db.close();process.exit(1)});
