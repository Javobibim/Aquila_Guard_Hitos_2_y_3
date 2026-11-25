/* Reglas locales explicables. No es una lista de reputación ni de sitios seguros. */
(() => {
 'use strict';
 const references = ['bancoestado.cl','bancochile.cl','santander.cl','bci.cl','paypal.com','microsoft.com','google.com','apple.com','mercadolibre.cl','mercadopago.cl'];
 const shorteners = new Set(['bit.ly','tinyurl.com','t.co','t.ly','cutt.ly','is.gd','rb.gy','shorturl.at','goo.su','ow.ly']);
 const numericNames = new Set(['bancoestado','bancochile','santander','paypal','microsoft','google','apple','mercadolibre','mercadopago']);
 function analyze(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('Pega una dirección web para revisarla.');
  let address = input.trim();
  if (address.length > 8192) throw new Error('La dirección es demasiado larga. Revisa un enlace de hasta 8192 caracteres.');
  if (/[\\\s\u0000-\u001f\u007f]/u.test(address)) throw new Error('La dirección contiene espacios o caracteres no válidos. Copia solo el enlace.');
  let assumedHttps = false;
  if (address.startsWith('//')) { address = 'https:' + address; assumedHttps = true; }
  else if (!/^https?:\/\//i.test(address)) {
   if (!/^(?:[^/?#:@]+\.[^/?#:@]+|localhost|\[[0-9a-f:]+\])(?::\d+)?(?:[/?#]|$)/i.test(address)) throw new Error('Usa una dirección de página web que empiece por https:// o http://.');
   address = 'https://' + address; assumedHttps = true;
  }
  let url;
  try { url = new URL(address); } catch { throw new Error('No pudimos leer esa dirección. Comprueba que el enlace esté completo.'); }
  if (!['http:','https:'].includes(url.protocol) || !url.hostname) throw new Error('Solo revisamos páginas HTTP o HTTPS.');
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const findings = [];
  const add = (id, title, detail) => findings.push({id, title, detail});
  if (url.username || url.password) add('userinfo', 'Texto antes de @', 'La parte anterior a @ puede confundir. El sitio al que apunta la dirección es ' + hostname + '.');
  for (const domain of references) {
   if (hostname !== domain && !hostname.endsWith('.' + domain) && hostname.includes(domain + '.')) {
    add('embedded-domain', 'Un nombre conocido dentro de otro dominio', 'La dirección contiene ' + domain + ', pero no termina en ese dominio. El destino mostrado es ' + hostname + '.');
    break;
   }
  }
  const labels = hostname.split(/[.\-]/);
  if (labels.some(label => /[013457]/.test(label) && numericNames.has(label.replace(/[013457]/g, c => ({'0':'o','1':'l','3':'e','4':'a','5':'s','7':'t'}[c]))))) add('numeric-name', 'Números que se parecen a letras', 'Una parte del dominio se parece al nombre de un servicio conocido usando números. Comprueba la dirección en un canal oficial.');
  if (!findings.some(f => f.id === 'numeric-name') && labels.some(label => label === 'banc0')) add('numeric-name', 'Una escritura que conviene revisar', 'El dominio contiene banc0, con un cero en lugar de una letra. Esto es una señal de escritura, no una confirmación de fraude.');
  if (url.protocol === 'http:') add('http', 'La conexión no está cifrada', 'Esta dirección usa HTTP. Evita introducir claves o datos sensibles. Usar HTTP por sí solo no demuestra una estafa.');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || (hostname.startsWith('[') && hostname.endsWith(']'))) add('ip', 'El sitio usa una dirección IP', 'El destino usa números o una dirección IPv6 en lugar de un nombre de dominio. También es habitual en servicios locales legítimos.');
  if (hostname.split('.').some(label => label.startsWith('xn--'))) add('idn', 'Un dominio con caracteres internacionales', 'El navegador representa parte del dominio con xn--. Puede ser legítimo; comprueba su escritura y el origen del enlace.');
  if (shorteners.has(hostname)) add('shortener', 'Un enlace acortado oculta el destino final', 'Esta revisión no expande enlaces ni sigue redirecciones. Pide al remitente la dirección completa antes de introducir datos.');
  return {hostname, protocol:url.protocol, address:url.href, assumedHttps, findings, hasSignals:findings.length > 0};
 }
 globalThis.AquilaRules = Object.freeze({version:'0.4.0', analyze});
})();
