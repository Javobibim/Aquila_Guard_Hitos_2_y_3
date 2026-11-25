(() => {
 'use strict';
 const el=id=>document.getElementById(id),engine=globalThis.AquilaEngine;
 const type=el('type'),file=el('file'),input=el('input'),result=el('result');
 const say=value=>{el('status').textContent=value;};
 let generation=0;
 try{
  const {count,fetchedAt}=engine.setReputation(JSON.parse(el('reports').textContent));
  el('intel').textContent=count.toLocaleString('es-CL')+' dominios en la copia del '+fetchedAt.slice(0,10)+'.';
 }catch{el('intel').textContent='Lista no disponible. Se aplicarán las reglas locales.';}
 function reset(){
  ++generation;result.hidden=true;el('reasons').replaceChildren();el('coverage-details').open=false;
  for(const id of ['title','advice','coverage'])el(id).textContent='';
  say('');
 }
 function selectType(){reset();file.value='';el('file-area').hidden=type.value!=='correo';input.maxLength=type.value==='correo'?50000:10000;}
 type.onchange=()=>{input.value='';selectType();};
 input.oninput=()=>{file.value='';reset();};
 file.onchange=()=>{input.value='';reset();};
 el('clear').onclick=()=>{input.value='';selectType();input.focus();};
 el('example').onclick=()=>{
  selectType();
  input.value='Tu cuenta está bloqueada. Ingresa tu clave en https://bancoestado.cl.acceso.example/verificar';
  say('Ejemplo ficticio cargado. Pulsa Revisar sin abrir enlaces.');
 };
 el('review').onsubmit=async event=>{
  event.preventDefault();reset();
  const current=generation,kind=type.value,mail=kind==='correo'?file.files[0]:null;
  try{
   if(mail?.size>2_097_152)throw Error('El correo supera el límite de 2 MB.');
   const text=mail?await mail.text():input.value;
   if(current!==generation)return;
   if(text.includes('\0'))throw Error('El archivo no es un correo de texto.');
   const review=engine.analyze(kind,text,{mailFile:!!mail});
   el('title').textContent=review.title;el('advice').textContent=review.recommendation;
   const links=review.checkedLinks===1?'1 enlace revisado.':review.checkedLinks+' enlaces revisados.';
   el('coverage').textContent=links+' '+(kind==='correo'?review.limitation:'Los enlaces se revisaron sin abrirlos. La ausencia de señales no garantiza seguridad.');
   for(const finding of review.findings){
    const li=document.createElement('li'),title=document.createElement('strong'),detail=document.createElement('span');
    title.textContent=finding.title;detail.textContent=finding.detail;li.append(title,detail);el('reasons').append(li);
   }
   result.dataset.risk=review.classification;result.hidden=false;el('title').focus();
  }catch(error){if(current===generation)say(error.message);}
 };
})();
