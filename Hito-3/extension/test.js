(() => {
 let address='https://bancoestado.cl.acceso.example/verificar';
 function run(){
  document.getElementById('aquila-guard-url-warning')?.remove();
  const result=globalThis.AquilaRules.analyze(address);
  document.getElementById('example-address').textContent=address;
  globalThis.AquilaGuardUrl.showWarning(result.findings.map(f=>f.detail),true,result.hostname);
  document.getElementById('result').textContent=result.hasSignals?'Se muestra un aviso de demostración con '+result.findings.length+' señal(es).':'Este ejemplo no coincide con las reglas locales. Eso no garantiza que una página real sea segura.';
 }
 document.getElementById('demo-domain').onclick=()=>{address='https://bancoestado.cl.acceso.example/verificar';run();};
 document.getElementById('demo-http').onclick=()=>{address='http://sitio-de-prueba.example';run();};
 document.getElementById('demo-neutral').onclick=()=>{address='https://biblioteca.example';run();};
 document.getElementById('again').onclick=run;run();
})();
