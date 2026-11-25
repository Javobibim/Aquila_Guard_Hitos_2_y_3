import express from 'express';
import {timingSafeEqual} from 'node:crypto';
import {resolve} from 'node:path';
import {ZodError} from 'zod';
import type {Database} from './db.js';
import {Records} from './repositories/records.js';
import {RecordService} from './services/records.js';
import {apiRoutes} from './routes/api.js';
import {AppError} from './errors.js';
const errorStatus={NOT_FOUND:404,GONE:410,IDEMPOTENCY_CONFLICT:409,CONTENT_TOO_LONG:422,INVALID_CONTENT:422,INVALID_URL:422,INVALID_PHONE:422};
export function createApp(db:Database,key:string){
 if(key.length<16)throw new Error('API_KEY debe tener al menos 16 caracteres.');
 const app=express();app.disable('x-powered-by');
 app.use((_req,res,next)=>{res.set({'X-Aquila-API-Revision':'summaries-v1','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"});next();});
 let healthCheck:Promise<boolean>|undefined,healthExpires=0;
 app.get('/health',async(_req,res)=>{
  if(!healthCheck||Date.now()>=healthExpires){
   healthExpires=Infinity;
   healthCheck=db.query('SELECT 1').then(()=>true,()=>false).finally(()=>{healthExpires=Date.now()+2000;});
  }
  if(await healthCheck)return res.json({status:'ok',service:'aquila-guard'});
  return res.status(503).json({status:'unavailable'});
 });
 const keyBuffer=Buffer.from('Bearer '+key);
 const requestWindowMs=60_000;
 let windowEnd=0,requestCount=0,activeRequests=0;
 app.use('/api', (req,res,next)=>{
  const provided=Buffer.from(req.get('authorization')||'');
  if(provided.length!==keyBuffer.length||!timingSafeEqual(provided,keyBuffer))return res.status(401).json({error:{code:'UNAUTHORIZED',message:'Ingresa una clave de acceso válida.'}});
  const now=Date.now();
  if(now>=windowEnd){windowEnd=now+requestWindowMs;requestCount=0;}
  if(requestCount>=60||activeRequests>=8){
   const wait=requestCount>=60?Math.ceil((windowEnd-now)/1000):1;
   return res.set('Retry-After',String(wait)).status(429).json({error:{code:'RATE_LIMITED',message:'Demasiadas solicitudes. Espera antes de reintentar.'}});
  }
  requestCount++;activeRequests++;
  res.once('close',()=>{activeRequests--;});
  next();
 });
 app.use('/api/v1',express.json({limit:'256kb',type:'application/json',inflate:false}),apiRoutes(new RecordService(new Records(db),key)));
 app.use('/api',(_req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'Ruta no encontrada.'}}));
 app.use(express.static(resolve('public')));
 app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  let status=500,code='INTERNAL_ERROR',message='No pudimos completar la solicitud.';
  if(error instanceof AppError){status=errorStatus[error.code];code=error.code;message=error.message;}
  else if(error instanceof ZodError){status=422;code='VALIDATION_ERROR';message=error.issues.map(i=>i.path.join('.')+': '+i.message).join('; ');}
  else if(error.type==='entity.parse.failed'){status=400;code='INVALID_JSON';message='JSON inválido.';}
  else if(error.type==='entity.too.large'){status=413;code='TOO_LARGE';message='Solicitud demasiado grande.';}
  else if(error.type==='encoding.unsupported'){status=415;code='UNSUPPORTED_ENCODING';message='Envía el JSON sin comprimir.';}
  else if(error.code==='23505'){status=409;code='CONFLICT';message='Ya existe una alerta para este análisis.';}
  else if(error.code==='23503'){status=404;code='NOT_FOUND';message='El análisis relacionado ya no existe.';}
  res.status(status).json({error:{code,message}});
 });return app;
}
