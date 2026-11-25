(() => {
 'use strict';
 // Se ejecuta únicamente tras pulsar el botón. Nunca se accede a input.value.
 function capture(){
  const hints=(document.title+' '+(document.querySelector('h1')?.textContent||'')).slice(0,2000).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const terms=['bancoestado','bancochile','santander','bci','paypal','microsoft','outlook','office365','google','gmail','apple','icloud','mercadolibre','mercadopago'];
  const claims=terms.filter(t=>new RegExp('(?:^|[^a-z])'+t+'(?:$|[^a-z])').test(hints));
  const forms=[...document.querySelectorAll('form')],passwordForms=[];
  for(const form of forms.slice(0,20))if(form.querySelector('input[type=password]')){
   const actions=[form.action,...[...form.querySelectorAll('[formaction]')].slice(0,5).map(b=>b.formAction)];
   for(const action of actions){try{const u=new URL(action||location.href,location.href);passwordForms.push({hostname:u.hostname,protocol:u.protocol});}catch{}}
  }
  const anchors=[...document.querySelectorAll('a[href]')],links=[];
  for(const a of anchors.slice(0,1000)){
   const text=(a.textContent||'').trim().slice(0,2000);if(!/^(?:https?:\/\/|www\.)/i.test(text))continue;
   try{const shown=new URL(/^https?:/i.test(text)?text:'https://'+text),actual=new URL(a.href);if(['http:','https:'].includes(actual.protocol))links.push({shownHost:shown.hostname,actualHost:actual.hostname});}catch{}
   if(links.length>=30)break;
  }
  const orphanPasswordFields=[...document.querySelectorAll('input[type=password]')].filter(input=>!input.form).length;
  return {claims,orphanPasswordFields,passwordForms:passwordForms.slice(0,20),links,framesSeen:document.querySelectorAll('iframe').length,truncated:forms.length>20||anchors.length>1000||passwordForms.length>20||links.length>=30};
 }
 globalThis.AquilaPageSnapshot=Object.freeze({capture});
})();
