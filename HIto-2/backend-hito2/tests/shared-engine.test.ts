import test from 'node:test';import assert from 'node:assert/strict';import {existsSync,readFileSync} from 'node:fs';import {evaluate,RULE_VERSION} from '../server/services/rules.js';
test('API usa la misma instantánea y reglas que app y extensión',()=>{
 const data=JSON.parse(readFileSync('data/reputation.json','utf8'));
 const manifestPath=new URL('../../extension/manifest.json',import.meta.url);
 if(existsSync(manifestPath)){
  // The release can change UI features while keeping the same detection rules.
  assert.match(RULE_VERSION,/^\d+\.\d+\.\d+$/);
  for(const file of ['url-rules.js','psl-data.js','advanced.js','engine.js']){
   assert.ok(readFileSync(new URL('../data/'+file,import.meta.url)).equals(readFileSync(new URL('../../shared/'+file,import.meta.url))),file);
  }
  assert.ok(readFileSync(new URL('../data/reputation.json',import.meta.url)).equals(readFileSync(new URL('../../data/reputation.json',import.meta.url))));
 }
 assert.equal(evaluate('enlace','https://'+data.domains[0]).signal,true);
 assert.match(evaluate('enlace','https://'+data.domains[0]).reasons[0],/PhishDestroy/);
 assert.equal(evaluate('enlace','https://bancoestado.cl.acceso.example').signal,true);
 assert.equal(evaluate('enlace','https://biblioteca.example/?q=urgente+clave+premio').signal,false);
 assert.equal(evaluate('telefono','+56 9 1234 5678').signal,false);
});
