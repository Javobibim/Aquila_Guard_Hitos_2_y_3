(() => {
 'use strict';
 if(globalThis.AquilaMessageSnapshot)return;
 function capture(allowSelection=false){
  const type=location.origin==='https://mail.google.com'?'correo':
   location.origin==='https://messages.google.com'&&location.pathname.startsWith('/web/')?'mensaje':'';
  if(!type)return null;
  const limit=type==='correo'?45000:9000;
  const visible=node=>node.getClientRects().length>0&&getComputedStyle(node).visibility==='visible'&&
   !node.closest('[hidden],[aria-hidden="true"],[contenteditable="true"],[role="dialog"],blockquote,.gmail_quote');
  if(allowSelection){
   const selection=getSelection();
   const start=selection?.anchorNode;
   const end=selection?.focusNode;
   const element=node=>node?.nodeType===1?node:node?.parentElement;
   if(selection&&!selection.isCollapsed&&[start,end].every(node=>element(node)&&
    !element(node).closest('textarea,input,[contenteditable="true"],[role="textbox"]'))){
    const text=selection.toString();
    if(text.trim())return {type,input:text.slice(0,limit),partial:text.length>limit,selection:true};
   }
  }
  let body;
  if(type==='correo'){
   const bodies=[...document.querySelectorAll('[role="main"] .a3s, main .a3s')].filter(visible);
   if(bodies.length!==1)return null;
   [body]=bodies;
  }else{
   const wrappers=[...document.querySelectorAll('mws-conversation-container mws-message-wrapper')];
   const latest=wrappers.filter(visible).at(-1);
   if(!latest||!latest.matches('[is-incoming="true"],[data-is-incoming="true"],.incoming'))return null;
   body=[...latest.querySelectorAll('mws-text-message-part,[data-e2e-message-text]')].find(visible);
  }
  if(!body)return null;
  const escape=text=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const walker=document.createTreeWalker(body,NodeFilter.SHOW_TEXT);
  let text='',node,count=0;
  while((node=walker.nextNode())&&count++<2500&&text.length<limit){
   if(node.parentElement&&visible(node.parentElement)&&!node.parentElement.closest('script,style,textarea,button')){
    text+=node.nodeValue.slice(0,limit-text.length)+' ';
   }
  }
  if(!text.trim())return null;
  let html='<body>'+escape(text).slice(0,limit-500)+'<br>', partial=text.length>=limit||count>=2500;
  for(const anchor of [...body.querySelectorAll('a[href]')].filter(visible).slice(0,31)){
   let address;try{address=new URL(anchor.href);}catch{continue;}
   if(!['http:','https:'].includes(address.protocol))continue;
   const fragment='<a href="'+escape(address.href)+'">'+escape(anchor.innerText.slice(0,250))+'</a> ';
   if(html.length+fragment.length>limit){partial=true;break;}
   html+=fragment;
  }
  return {type,input:html+'</body>',partial,selection:false};
 }
 globalThis.AquilaMessageSnapshot=Object.freeze({capture});
})();
