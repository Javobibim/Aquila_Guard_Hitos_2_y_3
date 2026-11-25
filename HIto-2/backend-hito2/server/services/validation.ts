import {z} from 'zod';
import {AppError} from '../errors.js';
const tipos=z.enum(['enlace','correo','mensaje','telefono']);
const create=z.object({tipo:tipos,contenido:z.string().trim().min(1).max(50000)}).strict();
export function analysisInput(body:unknown){
 const v=create.parse(body);
 const max={enlace:8192,correo:50000,mensaje:10000,telefono:32}[v.tipo];
 if(v.contenido.length>max)throw new AppError('CONTENT_TOO_LONG','El contenido supera el límite de '+max+' caracteres para este tipo.');
 if(['correo','mensaje'].includes(v.tipo)&&v.contenido.length<5)throw new AppError('INVALID_CONTENT','Escribe al menos cinco caracteres.');
 if(v.tipo==='enlace'){
  try{const u=new URL(v.contenido);if(!/^https?:\/\/[^/\\]/i.test(v.contenido)||!['http:','https:'].includes(u.protocol)||!u.hostname.includes('.')||u.username||u.password||/[\s\\]/.test(v.contenido))throw 0;}
  catch{throw new AppError('INVALID_URL','Usa un enlace http o https completo, sin espacios ni credenciales.');}
 }
 if(v.tipo==='telefono'&&(!/^\+?[\d\s()-]+$/.test(v.contenido)||v.contenido.replace(/\D/g,'').length<7||v.contenido.replace(/\D/g,'').length>15))throw new AppError('INVALID_PHONE','El teléfono debe tener entre 7 y 15 dígitos.');
 return v;
}
export const analysisPatch=z.object({nota:z.string().trim().max(300)}).strict();
export const alertInput=z.object({analisis_id:z.uuid()}).strict();
export const alertPatch=z.object({revisada:z.boolean().optional(),nota:z.string().trim().max(300).optional()}).strict().refine(x=>Object.keys(x).length>0,'Indica revisada o nota.');
export function idInput(v:unknown){return z.uuid().parse(v)}
export function paging(query:unknown){return z.object({limit:z.coerce.number().int().min(1).max(100).default(50),offset:z.coerce.number().int().min(0).max(100000).default(0)}).strict().parse(query)}
