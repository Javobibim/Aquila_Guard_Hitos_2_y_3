import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
type Finding={id:string;title:string;detail:string};
type Result={title:string;hostname:string;findings:Finding[];hasSignals:boolean;recommendation:string;limitation:string};
type Engine={version:string;setReputation(data:unknown):unknown;analyze(type:string,input:string):Result};
const context=createContext({URL,crypto:webcrypto,TextEncoder,TextDecoder,atob});
for(const name of ['url-rules.js','psl-data.js','advanced.js','engine.js'])runInContext(readFileSync(new URL('../../data/'+name,import.meta.url),'utf8'),context,{filename:name});
const engine=context.AquilaEngine as Engine;
engine.setReputation(JSON.parse(readFileSync(new URL('../../data/reputation.json',import.meta.url),'utf8')));
export const RULE_VERSION=engine.version;
export function evaluate(tipo:string,contenido:string){
 const result=engine.analyze(tipo,contenido);
 return {title:result.title,summary:tipo==='enlace'?result.hostname.slice(0,253):'Revisión de '+tipo,reasons:result.findings.length?Array.from(result.findings,f=>f.detail):[tipo==='telefono'?result.recommendation:'Las reglas limitadas pueden omitir fraudes. Ausencia de señales no significa seguridad.'],signal:result.hasSignals,recommend:result.recommendation};
}
