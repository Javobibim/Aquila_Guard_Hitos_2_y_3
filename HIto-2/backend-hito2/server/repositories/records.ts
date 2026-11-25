import type {Database} from '../db.js';
import type {evaluate} from '../services/rules.js';
// Los identificadores de tabla se seleccionan internamente. Valores siempre parametrizados.
const fields={
 analisis:'id,tipo,resumen,titulo,razones,con_senales,recomendacion,version_reglas,nota,creado_en',
 alertas:'id,analisis_id,revisada,nota,creado_en'
};
const analysisInsert='INSERT INTO analisis(id,tipo,resumen,titulo,razones,con_senales,recomendacion,version_reglas)';
export class Records {
 constructor(private db:Database){}
 async list(resource:'analisis'|'alertas',limit:number,offset:number){return (await this.db.query(`SELECT ${fields[resource]} FROM ${resource} ORDER BY creado_en DESC,id LIMIT $1 OFFSET $2`,[limit,offset])).rows;}
 async get(resource:'analisis'|'alertas',id:string){return (await this.db.query(`SELECT ${fields[resource]} FROM ${resource} WHERE id=$1`,[id])).rows[0];}
 async findRetry(key:string):Promise<{fingerprint:string;analysisId:string}|undefined>{
  return (await this.db.query('SELECT huella AS fingerprint, analisis_id AS "analysisId" FROM analisis_reintentos WHERE clave=$1',[key])).rows[0];
 }
 async createAnalysis(id:string,type:string,result:ReturnType<typeof evaluate>,version:string,retry?:{key:string;fingerprint:string}){
  const values=[id,type,result.summary,result.title,JSON.stringify(result.reasons),result.signal,result.recommend,version];
  if(!retry)return (await this.db.query(analysisInsert+' VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8) RETURNING '+fields.analisis,values)).rows[0];
  // La reserva y el análisis se confirman juntos; la clave es única incluso entre procesos.
  const statement=`WITH claim AS (
    INSERT INTO analisis_reintentos(clave,huella,analisis_id) VALUES($9,$10,$1)
    ON CONFLICT (clave) DO NOTHING RETURNING analisis_id
   )
   ${analysisInsert} SELECT analisis_id,$2,$3,$4,$5::jsonb,$6::boolean,$7,$8 FROM claim RETURNING ${fields.analisis}`;
  return (await this.db.query(statement,[...values,retry.key,retry.fingerprint])).rows[0];
 }
 async note(id:string,nota:string){return (await this.db.query('UPDATE analisis SET nota=$2 WHERE id=$1 RETURNING '+fields.analisis,[id,nota])).rows[0];}
 async createAlert(id:string,analysisId:string){return (await this.db.query('INSERT INTO alertas(id,analisis_id) VALUES($1,$2) RETURNING *',[id,analysisId])).rows[0];}
 async updateAlert(id:string,v:any){return (await this.db.query('UPDATE alertas SET revisada=COALESCE($2,revisada),nota=COALESCE($3,nota) WHERE id=$1 RETURNING *',[id,v.revisada??null,v.nota??null])).rows[0];}
 async delete(resource:'analisis'|'alertas',id:string){return (await this.db.query(`DELETE FROM ${resource} WHERE id=$1 RETURNING id`,[id])).rows[0];}
}
