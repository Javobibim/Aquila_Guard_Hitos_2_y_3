import {mkdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {PGlite} from '@electric-sql/pglite';
export interface Database {query(sql:string, params?:any[]):Promise<{rows:any[]}>; exec(sql:string):Promise<void>; close():Promise<void>}
export async function connectDatabase(env:NodeJS.ProcessEnv=process.env):Promise<Database>{
 if(env.DB_DRIVER==='pglite'){
  if(!env.PGLITE_PATH) throw new Error('PGLITE_PATH obligatorio: usar una ruta persistente.');
  await mkdir(env.PGLITE_PATH,{recursive:true});
  const db=new PGlite(env.PGLITE_PATH); await db.waitReady;
  return {query:(s,p)=>db.query(s,p),exec:async s=>{await db.exec(s)},close:()=>db.close()};
 }
 if(env.DB_DRIVER && env.DB_DRIVER!=='postgres')throw new Error('DB_DRIVER debe ser postgres o pglite.');
 if(!env.DATABASE_URL)throw new Error('Falta DATABASE_URL.');
 const pool=new Pool({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000});
 await pool.query('SELECT 1');
 return {query:(s,p)=>pool.query(s,p),exec:async s=>{await pool.query(s)},close:()=>pool.end()};
}
