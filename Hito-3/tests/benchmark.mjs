import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),intel=JSON.parse(await readFile(path.join(root,'data/reputation.json'),'utf8'));
async function engine(base,advanced){const c=vm.createContext({URL,crypto:webcrypto,TextEncoder,TextDecoder,atob});const files=advanced?['url-rules.js','psl-data.js','advanced.js','engine.js']:['url-rules.js','engine.js'];for(const f of files)vm.runInContext(await readFile(path.join(base,'shared',f),'utf8'),c);c.AquilaEngine.setReputation(intel);return c.AquilaEngine;}
const baseline=await engine(path.join(root,'evaluation/baseline-0.5'),false),current=await engine(root,true);
const cases=[];function add(id,tipo,label,input,family){cases.push({id,tipo,label,input,family});}
for(const [i,url] of ['https://bancoestado.cl.acceso.example','https://microsfot.example','https://paypaal.example','https://apple-soporte.example','https://bancoestado-seguridad.example','https://seguridad.bancoestado.example','http://192.0.2.1/cuenta','https://user@otro.example','https://xn--bcher-kva.example/cuenta'].entries())add('U'+i,'enlace','fraude_ficticio',url,'URL de escenario ficticio');
for(const [i,url] of ['https://bancoestado.cl','https://support.apple.com','https://login.microsoftonline.com','https://biblioteca.example','https://accounts.google.com','https://www.paypal.com','https://universidad.example/?q=urgente+clave+premio','https://tienda.example/producto','https://mail.proveedor.co.uk','https://archivo.example/documentos'].entries())add('L'+i,'enlace','legitimo_ficticio',url,'Control de URL');
for(const [i,index] of [0,100,1000].entries())add('R'+i,'enlace','reportado_copia','https://'+intel.domains[index],'Dominio de instantánea: no visitado');
const emails=[
 ['M0','fraude_ficticio','From: PayPal <servicio@documentos.example>\nReply-To: pagos@revision.example\nSubject: Estado de cuenta\n\nTu documento está disponible.'],
 ['M1','fraude_ficticio','Content-Type: text/html\n\n<a href="https://consulta.example">https://www.bancoestado.cl/cuenta</a>'],
 ['M2','fraude_ficticio','From: avisos@cuenta.example\nAuthentication-Results: receptor.example; spf=fail; dkim=fail; dmarc=fail\n\nHay un documento disponible.'],
 ['M3','fraude_ficticio','Content-Type: text/plain\nContent-Transfer-Encoding: base64\n\n'+Buffer.from('Consulta https://'+intel.domains[0]).toString('base64')],
 ['M4','fraude_ficticio','From: documentos@proveedor.example\nReply-To: cobranzas@otraempresa.example\nSubject: Informe solicitado\n\nAdjunto la referencia del documento.'],
 ['M5','fraude_ficticio','El proveedor modificó los datos bancarios. Realiza el abono a la nueva cuenta indicada.'],
 ['M6','fraude_ficticio','Para consultar el documento debes activar macros y habilitar contenido.'],
 ['M7','fraude_ficticio','Comparte tu código de verificación para completar la operación.'],
 ['M8','fraude_ficticio','Su cuenta suspendida requiere atención inmediata en https://bancoestado-seguridad.example'],
 ['M9','fraude_ficticio','Visita https://www.google.com/url?q='+encodeURIComponent('https://'+intel.domains[0])],
 ['N0','legitimo_ficticio','From: avisos@biblioteca.example\nReply-To: ayuda@mail.biblioteca.example\nSubject: Horario del taller\n\nEl taller comienza a las diez.'],
 ['N1','legitimo_ficticio','Nunca comparta su clave con otras personas. Use los canales oficiales.'],
 ['N2','legitimo_ficticio','No compartas tu código de verificación. Este mensaje es un recordatorio de seguridad.'],
 ['N3','legitimo_ficticio','La oficina confirma la recepción de tu solicitud. Puedes consultar los horarios en https://municipio.example'],
 ['N4','legitimo_ficticio','From: comunicados@proveedor.co.uk\nReply-To: soporte@mail.proveedor.co.uk\nAuthentication-Results: receptor.example; spf=pass; dkim=pass; dmarc=pass\n\nLa próxima reunión es el jueves.'],
 ['N5','legitimo_ficticio','Content-Type: text/html\n\n<a href="https://biblioteca.example/horarios">https://biblioteca.example</a>'],
 ['N6','legitimo_ficticio','El premio de literatura se entregará durante el taller. Este es un anuncio informativo.'],
 ['N7','legitimo_ficticio','Es urgente reparar la impresora de la oficina. No se solicitan datos ni pagos.'],
 ['B0','fraude_ficticio','From: gestion@proveedor.example\nAuthentication-Results: receptor.example; spf=pass; dkim=pass; dmarc=pass\nSubject: Documento solicitado\n\nConsulta tu documento en https://proveedor.example/documentos/123'],
 ['B1','fraude_ficticio','From: amiga@correo.example\nSubject: Fotos\n\nTe comparto https://album.example/fotos para que veas las imágenes.']
];for(const [id,label,input] of emails)add(id,'correo',label,input,id.startsWith('B')?'Límite deliberado: compromiso o fraude sin señales observables':'Correo o mensaje de escenario ficticio');
const matrix={};const detail=[];
for(const [name,e] of [['0.5.0',baseline],['0.6.1',current]]){const m={TP:0,FN:0,FP:0,TN:0,errors:0};for(const c of cases){let r;try{r=e.analyze(c.tipo,c.input);}catch{m.errors++;detail.push({id:c.id,version:name,error:true});continue;}const positive=c.label!=='legitimo_ficticio',predicted=r.hasSignals;m[positive?(predicted?'TP':'FN'):(predicted?'FP':'TN')]++;detail.push({id:c.id,version:name,label:c.label,reviewSignal:predicted,findingIds:r.findings.map(f=>f.id),family:c.family});}matrix[name]=m;}
const report={cases:cases.length,interpretation:'Corpus interno de escenarios construidos, no muestra representativa ni evaluación independiente de eficacia en internet. TP/FN/FP/TN comparan una señal de revisión frente a la etiqueta del escenario, no una confirmación de fraude.',matrix,detail};
await mkdir(path.join(root,'test-results'),{recursive:true});await writeFile(path.join(root,'test-results/benchmark-results.json'),JSON.stringify(report,null,2));await mkdir(path.join(root,'evaluation'),{recursive:true});await writeFile(path.join(root,'evaluation/casos.json'),JSON.stringify(cases,null,2));
console.log(JSON.stringify({cases:cases.length,matrix,limitations:detail.filter(x=>x.version==='0.6.1'&&x.label==='fraude_ficticio'&&!x.reviewSignal).map(x=>x.id)}));
