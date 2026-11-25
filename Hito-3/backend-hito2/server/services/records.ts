import {createHmac,randomUUID} from 'node:crypto';
import {Records} from '../repositories/records.js';
import {AppError} from '../errors.js';
import {evaluate,RULE_VERSION} from './rules.js';
export class RecordService {
 constructor(private repo:Records,private fingerprintKey:string){}
 list(r:'analisis'|'alertas',limit:number,offset:number){return this.repo.list(r,limit,offset)}
 async get(r:'analisis'|'alertas',id:string){const v=await this.repo.get(r,id);if(!v)throw new AppError('NOT_FOUND','Registro no encontrado.');return v;}
 async createAnalysis(v:{tipo:string,contenido:string},retryKey?:string){
  const retry=retryKey?{key:retryKey,fingerprint:createHmac('sha256',this.fingerprintKey).update(JSON.stringify([v.tipo,v.contenido])).digest('hex')}:undefined;
  if(retry){
   const prior=await this.repo.findRetry(retry.key);
   if(prior)return this.replay(prior,retry.fingerprint);
  }
  const data=await this.repo.createAnalysis(randomUUID(),v.tipo,evaluate(v.tipo,v.contenido),RULE_VERSION,retry);
  if(data)return {data,replayed:false};
  if(!retry)throw Error('No se creó el análisis.');
  const prior=await this.repo.findRetry(retry.key);
  if(!prior)throw Error('No se pudo recuperar la operación de análisis.');
  return this.replay(prior,retry.fingerprint);
 }
 private async replay(prior:{fingerprint:string;analysisId:string},fingerprint:string){
  if(prior.fingerprint!==fingerprint)throw new AppError('IDEMPOTENCY_CONFLICT','Esa clave ya se usó para un contenido distinto.');
  const data=await this.repo.get('analisis',prior.analysisId);
  if(!data)throw new AppError('GONE','La revisión de esa operación ya se eliminó.');
  return {data,replayed:true};
 }
 async note(id:string,nota:string){const v=await this.repo.note(id,nota);if(!v)throw new AppError('NOT_FOUND','Análisis no encontrado.');return v;}
 async createAlert(analysisId:string){await this.get('analisis',analysisId);return this.repo.createAlert(randomUUID(),analysisId);}
 async updateAlert(id:string,v:any){const item=await this.repo.updateAlert(id,v);if(!item)throw new AppError('NOT_FOUND','Alerta no encontrada.');return item;}
 async delete(r:'analisis'|'alertas',id:string){if(!await this.repo.delete(r,id))throw new AppError('NOT_FOUND','Registro no encontrado.');}
}
