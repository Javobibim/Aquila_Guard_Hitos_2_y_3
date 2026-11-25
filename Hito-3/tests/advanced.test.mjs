import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
async function setup(){const ctx=vm.createContext({URL,crypto:webcrypto,TextEncoder,TextDecoder,atob});for(const f of ['url-rules.js','psl-data.js','advanced.js','engine.js'])vm.runInContext(await readFile(new URL('../shared/'+f,import.meta.url),'utf8'),ctx);ctx.AquilaEngine.setReputation({format:1,source:'PhishDestroy primary',fetchedAt:'2026-10-31T12:00:00Z',domains:['reportado.example']});return {e:ctx.AquilaEngine,a:ctx.AquilaAdvanced};}
test('el correo contrasta dominios de cabeceras y direcciones pegadas sin protocolo',async()=>{
 const {e}=await setup();
 const header=e.analyze('correo','From: persona@reportado.example\nSubject: Consulta\n\nHola.');
 assert.equal(header.classification,'reported');
 assert.ok(!JSON.stringify(e.toRecord(header,'app')).includes('persona@'));
 const body=e.analyze('correo','Verifica tu acceso en accounts.google.com.acceso.example/entrar.');
 assert.equal(body.classification,'signals');
 assert.equal(body.hostname,'accounts.google.com.acceso.example');
 assert.equal(e.analyze('correo','Escribe a persona@reportado.example para preguntar.').checkedLinks,0);
 assert.deepEqual(Array.from(e.reportedHosts(['reportado.example','www.reportado.example','otro.reportado.example'])),['reportado.example','www.reportado.example']);
});
test('PSL reconoce dominios por país, privados y reglas wildcard/exception',async()=>{const {a}=await setup();for(const [h,expected] of [['x.banco.co.uk','banco.co.uk'],['a.github.io','a.github.io'],['b.github.io','b.github.io'],['www.city.kawasaki.jp','city.kawasaki.jp'],['a.b.ck','a.b.ck'],['www.bancoestado.cl','bancoestado.cl']])assert.equal(a.org(h),expected);assert.ok(a.publicSuffixRules>9000);});
test('dominios parecidos se detectan sin marcar las referencias oficiales por similitud',async()=>{const {e}=await setup();for(const domain of ['microsfot.com','paypaal.example','bancoestado-soporte.example','seguridad.bancoestado.example'])assert.ok(e.analyze('enlace','https://'+domain).hasSignals,domain);for(const domain of ['www.microsoft.com','login.microsoftonline.com','www.bancoestado.cl','support.apple.com','accounts.google.com'])assert.equal(e.analyze('enlace','https://'+domain).hasSignals,false,domain);});
test('destinos escritos dentro de una URL se analizan sin seguir redirecciones',async()=>{const {e}=await setup();const x=e.analyze('enlace','https://www.google.com/url?q='+encodeURIComponent('https://reportado.example/'));assert.equal(x.classification,'reported');assert.ok(x.findings.some(f=>f.id==='embedded-destination'));});
test('Reply-To diferente y nombre de marca suplantado dejan razones sin guardar correos personales',async()=>{const {e}=await setup();const input='From: PayPal <persona-privada@otro.example>\r\nReply-To: ayuda-privada@respuesta.example\r\nSubject: Documento disponible\r\n\r\nPuedes consultar el documento.';const r=e.analyze('correo',input);assert.ok(r.findings.some(f=>f.id==='reply-mismatch'));assert.ok(r.findings.some(f=>f.id==='sender-brand'));assert.equal(r.mailAnalysis.authenticationVerified,false);const saved=JSON.stringify(e.toRecord(r,'app'));assert.ok(!saved.includes('persona-privada'));assert.ok(!saved.includes('ayuda-privada'));});
test('Reply-To de otro subdominio de la misma organización no dispara discrepancia',async()=>{const {e}=await setup();const r=e.analyze('correo','From: avisos@mail.biblioteca.co.uk\nReply-To: ayuda@soporte.biblioteca.co.uk\nSubject: Horario\n\nAbrimos a las diez.');assert.ok(!r.findings.some(f=>f.id==='reply-mismatch'));assert.equal(r.hasSignals,false);});
test('cabeceras SPF DKIM DMARC aportadas son indicios y no una verificación propia',async()=>{const {e}=await setup();const r=e.analyze('correo','From: alertas@example.test\nAuthentication-Results: receptor.example; spf=fail; dkim=fail; dmarc=fail\n\nHola.');for(const id of ['auth-spf','auth-dkim','auth-dmarc'])assert.ok(r.findings.some(f=>f.id===id));assert.equal(r.mailAnalysis.authenticationVerified,false);});
test('HTML con texto de enlace distinto al href se analiza sin ejecutar código',async()=>{const {e}=await setup();const r=e.analyze('correo','Content-Type: text/html\n\n<script>throw new Error(\"NO_EJECUTAR\")</script><a href=\"https://otro.example/a?x=PRIVADO\">https://www.paypal.com/cuenta</a>');assert.ok(r.findings.some(f=>f.id==='hidden-link'));assert.ok(!JSON.stringify(e.toRecord(r,'app')).includes('PRIVADO'));});
test('se decodifica texto base64 y quoted-printable, sin analizar el adjunto',async()=>{const {e}=await setup();for(const [encoding,body] of [['base64',Buffer.from('Visita https://reportado.example para el documento.').toString('base64')],['quoted-printable','Visita https://reportado=2Eexample para el documento.']])assert.equal(e.analyze('correo','Content-Type: text/plain; charset=utf-8\nContent-Transfer-Encoding: '+encoding+'\n\n'+body).classification,'reported');const mime='MIME-Version: 1.0\nContent-Type: multipart/mixed; boundary=\"abc\"\n\n--abc\nContent-Type: text/plain\n\nEl taller comienza mañana.\n--abc\nContent-Disposition: attachment; filename=\"ejemplo.txt\"\nContent-Type: text/plain\n\nhttps://reportado.example\n--abc--';const r=e.analyze('correo',mime);assert.equal(r.hasSignals,false);assert.equal(r.mailAnalysis.ignoredAttachments,1);});
test('cabecera codificada y caracteres invisibles se procesan de forma acotada',async()=>{const {e}=await setup();const name=Buffer.from('PayPal').toString('base64');const r=e.analyze('correo','From: =?UTF-8?B?'+name+'?= <avisos@otro.example>\nSubject: Documento\n\nhttps://repo\u200brtado.example');assert.ok(r.findings.some(f=>f.id==='sender-brand'));assert.ok(r.findings.some(f=>f.id==='invisible-characters'));assert.equal(r.classification,'reported');});
test('un dominio comprometido sin señales observables queda sin coincidencias; no se garantiza seguridad',async()=>{const {e}=await setup();const r=e.analyze('correo','From: gestion@proveedor.example\nAuthentication-Results: receptor.example; spf=pass; dkim=pass; dmarc=pass\nSubject: Documento solicitado\n\nPuedes consultar tu documento en https://proveedor.example/documentos/123');assert.equal(r.hasSignals,false);assert.match(r.limitation,/No encontrar señales no garantiza seguridad/);assert.equal(r.mailAnalysis.authenticationVerified,false);});
test('correo de hasta 50.000 caracteres y límites mayores se validan',async()=>{const {e}=await setup();assert.doesNotThrow(()=>e.analyze('correo','a'.repeat(50000)));assert.throws(()=>e.analyze('correo','a'.repeat(50001)));assert.throws(()=>e.analyze('mensaje','a'.repeat(10001)));});
test('consejos legítimos no se interpretan como solicitud de claves; cambio de pago y macros sí dejan señal',async()=>{const {e}=await setup();for(const text of ['Nunca comparta su clave con nadie.','No compartas tu código de verificación.','Evita compartir tu contraseña.'])assert.equal(e.analyze('mensaje',text).hasSignals,false,text);assert.ok(e.analyze('mensaje','Comparte tu código de verificación para completar el acceso.').findings.some(f=>f.id==='secrets'));assert.ok(e.analyze('correo','El pago se debe hacer a la nueva cuenta indicada.').findings.some(f=>f.id==='payment-change'));assert.ok(e.analyze('correo','Debes activar macros para ver el documento.').findings.some(f=>f.id==='unsafe-instructions'));});
test('inspección de página identifica destino de contraseña y marca; el resumen omite metadatos privados',async()=>{const {e}=await setup();const meta={claims:['paypal'],passwordForms:[{hostname:'destino.example',protocol:'https:'}],links:[{shownHost:'paypal.com',actualHost:'reportado.example'}],inputValue:'SECRETO_NO_LEER'};const r=e.analyzePage('https://consulta.example',meta);for(const id of ['password-destination','page-brand','page-link-mismatch','page-reported-link'])assert.ok(r.findings.some(f=>f.id===id));assert.equal(r.classification,'reported');assert.equal(r.pageAnalysis.fieldValuesRead,false);assert.ok(!JSON.stringify(e.toRecord(r,'extension')).includes('SECRETO_NO_LEER'));});
test('inspección normal oficial y límites de correo permanecen explícitos',async()=>{const {e}=await setup();assert.equal(e.analyzePage('https://www.paypal.com',{claims:['paypal'],passwordForms:[{hostname:'login.paypal.com',protocol:'https:'}],links:[]}).hasSignals,false);assert.throws(()=>e.analyzePage('https://example.com',{}));const links=Array.from({length:35},(_,i)=>'https://sitio'+i+'.example').join(' ');assert.ok(e.analyze('correo',links).findings.some(f=>f.id==='link-limit'));});
test('un .eml de Gmail conserva los enlaces de botones y omite adjuntos aunque el archivo exceda el límite de pegado',async()=>{
 const {e}=await setup();
 const mail=['From: Avisos <soporte@biblioteca.example>','MIME-Version: 1.0','Content-Type: multipart/mixed; boundary="x.y+"','','--x.y+','Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: quoted-printable','','<!-- <a href=3D"https://ignorar.example">Oculto</a> -->','<a data-href=3D"https://otro.example" href=3D"//reportado&#46;exam=','ple/revisar">Ver documento</a><p>Texto --x.y+ literal.</p>','--x.y+','Content-Type: application/octet-stream','Content-Disposition: attachment','', 'A'.repeat(60_000),'--x.y+--'].join('\r\n');
 assert.throws(()=>e.analyze('correo',mail));
 const result=e.analyze('correo',mail,{mailFile:true});
 assert.equal(result.classification,'reported');
 assert.equal(result.hostname,'reportado.example');
 assert.equal(result.checkedLinks,1);
 assert.equal(result.mailAnalysis.ignoredAttachments,1);
 assert.equal(result.mailAnalysis.decodeErrors,0);
});
test('un reporte no se pierde por acumular señales previas',async()=>{
 const {e}=await setup();
 const links=Array.from({length:23},(_,i)=>'<a href="https://x'+i+'.example/">https://bancoestado.cl</a>');
 const result=e.analyze('correo','Content-Type: text/html\n\n'+links.join(' ')+' <a href="https://reportado.example">Ver</a>');
 assert.equal(result.findings.length,20);
 assert.equal(result.classification,'reported');
});
test('enlaces anidados conservan sus parámetros codificados y permiten pegar direcciones con doble barra',async()=>{
 const {e}=await setup();
 const middle='https://biblioteca.example/?documento='+encodeURIComponent('&next=https://reportado.example');
 const wrapped='//www.google.com/url?q='+encodeURIComponent(middle);
 const result=e.analyze('enlace',wrapped);
 assert.equal(result.checkedLinks,2);
 assert.equal(result.classification,'signals');
 assert.ok(!result.findings.some(f=>f.id==='reported'));
});
test('el detector distingue pedidos de credenciales de recordatorios y palabras aisladas',async()=>{
 const {e}=await setup();
 for(const text of ['El premio de literatura se entrega el martes.','Es urgente reparar la impresora.','Never share your verification code.']){
  assert.equal(e.analyze('correo',text).hasSignals,false);
 }
 assert.ok(e.analyze('correo','Enter your verification code to continue.').findings.some(f=>f.id==='secrets'));
});
test('HTML malformado se analiza y href dentro de otro atributo se ignora',async()=>{
 const {e}=await setup();
 const malformed='Content-Type: text/html\n\n'+'<'.repeat(48_000)+'<a href="https://reportado.example">Ver</a>';
 assert.equal(e.analyze('correo',malformed).classification,'reported');
 const impostor='Content-Type: text/html\n\n<a title="Pulsa > href=\'https://reportado.example\'" href="https://normal.example">Ver</a>';
 const result=e.analyze('correo',impostor);
 assert.equal(result.checkedLinks,1);
 assert.equal(result.hostname,'normal.example');
 assert.equal(result.hasSignals,false);
});
