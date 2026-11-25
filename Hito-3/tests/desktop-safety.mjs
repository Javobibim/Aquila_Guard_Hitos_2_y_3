import assert from 'node:assert/strict';
import {cp, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const playwright = process.env.AQUILA_PLAYWRIGHT;
if (!playwright) throw new Error('Define AQUILA_PLAYWRIGHT con la ruta a playwright/index.mjs.');
const {chromium} = await import(pathToFileURL(playwright).href);
const root = resolve(import.meta.dirname, '..');
const fixture = await mkdtemp(join(root, 'test-results', 'desktop-safety-'));
const extension = join(fixture, 'extension');
await cp(join(root, 'dist', 'extension'), extension, {recursive: true});
const manifestPath = join(extension, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.host_permissions.push(...manifest.optional_host_permissions);
await writeFile(manifestPath, JSON.stringify(manifest));
const reputation = JSON.parse(await readFile(join(extension, 'data', 'reputation.json'), 'utf8'));
const reported = reputation.domains[0];
const base = 'https://prueba-aquila.example';
const ad = '<div data-ad-slot style="width:100px;height:65px">Espacio de prueba</div>';
const adRegistration = '/es/register?ref_code=REFERIDO_FICTICIO&click_id=CLIC_FICTICIO';
const adConfirmation = '/prelanders/confirm-m/index.html?fa=1&var_1=CAMPAIGN_ONE&var_2=CAMPAIGN_TWO';
const timedSurvey = '<h1>¡Bono de ejemplo!</h1><p>Has sido seleccionado al azar para participar en esta encuesta.</p><p>Solo tienes <strong>2 minutos y 40 segundos</strong> para participar.</p><button>Opción ficticia</button>';
const pages = {
 '/normal':'<p>Control sin señales.</p>',
 '/ads':ad.repeat(4),
 '/popup':'<script type="application/x-aquila-fixture" src="/js/popa.js"></script>',
 '/open-ad':[adRegistration,adConfirmation].map((address,index)=>'<a target="_blank" rel="noopener" href="'+address.replaceAll('&','&amp;')+'">Abrir anuncio '+index+'</a>').join(' '),
 '/es/register':'<p>Formulario de registro ficticio.</p>',
 '/prelanders/confirm-m/index.html':'<p>Pantalla ficticia de confirmación.</p>',
 '/ad-report':'<div data-ad-slot style="width:160px;height:70px"><a href="https://'+reported+'/">Anuncio ficticio</a></div>',
 '/reload':'<p>Control de recargas.</p>',
 '/113/test.html':'<main hidden>'+timedSurvey+'</main>',
 '/feedback':'<main><h1>Encuesta de satisfacción</h1><p>Fuiste seleccionado al azar para la encuesta. Completarla suele tomar 2 minutos.</p></main>'
};
const context = await chromium.launchPersistentContext(join(fixture, 'profile'), {
 headless: true,
 executablePath: process.env.AQUILA_CHROMIUM || resolve(root, '../browser-runtime/chromium-1234/chrome-win64/chrome.exe'),
 args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
});
try {
 const external = [];
 await context.route('https://**/*', route => {
  const url = new URL(route.request().url());
  if (url.origin === base) return route.fulfill({contentType:'text/html',body:pages[url.pathname] || ''});
  external.push(url.hostname);
  return route.abort();
 });
 const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
 const panel = await context.newPage();
 await panel.goto(`chrome-extension://${new URL(worker.url()).hostname}/popup.html`);
 await panel.waitForFunction(async()=>typeof (await chrome.storage.local.get('enabled')).enabled==='boolean');
 await panel.locator('#enable').click();
 await panel.locator('#state').filter({hasText:'activados'}).waitFor();
 const page = await context.newPage();
 const banner = page.locator('#aquila-guard-url-warning');
 const waitForColor = (color) => banner.locator('.active-'+color).waitFor({timeout:8000});
 await page.goto(base+'/normal');
 await page.waitForTimeout(1600);
 assert.equal(await banner.count(), 0);
 await page.goto(base+'/feedback');
 await page.waitForTimeout(1600);
 assert.equal(await banner.count(),0);
 await page.goto(base+'/113/test.html?campaignid=FICTICIO');
 await page.waitForTimeout(1600);
 assert.equal(await banner.count(),0);
 await page.locator('main').evaluate(main=>main.hidden=false);
 await waitForColor('amber');
 assert.equal(await banner.locator('h2').innerText(),'Encuesta inesperada con límite de tiempo');
 assert.match(await banner.locator('.notice').innerText(),/seleccionado al azar/);
 await page.goto(base+'/ads');
 await waitForColor('amber');
 assert.match(await banner.locator('.notice').innerText(), /4 espacios/);
 await page.goto(base+'/popup');
 await waitForColor('amber');
 assert.match(await banner.locator('.notice').innerText(), /ventanas publicitarias/);
 await page.goto(base+'/es/register?ref_code=REFERIDO_FICTICIO');
 await page.waitForTimeout(1600);
 assert.equal(await banner.count(),0);
 await page.goto(base+'/open-ad');
 for(const [index,title] of ['Registro con seguimiento publicitario','Página intermedia con seguimiento publicitario'].entries()){
  const [adPage] = await Promise.all([context.waitForEvent('page'),page.getByRole('link',{name:'Abrir anuncio '+index}).click()]);
  try {
   const adBanner = adPage.locator('#aquila-guard-url-warning');
   await adBanner.locator('.active-amber').waitFor({timeout:8000});
   assert.equal(await adBanner.locator('h2').innerText(),title);
   assert.doesNotMatch(await adBanner.locator('.notice').innerText(),/REFERIDO_FICTICIO|CLIC_FICTICIO|CAMPAIGN_ONE|CAMPAIGN_TWO/);
  } finally {
   await adPage.close();
  }
 }
 await page.goto(base+'/prelanders/confirm-m/index.html?var_1=UNO&var_1=DOS');
 await page.waitForTimeout(1600);
 assert.equal(await banner.count(),0);
 await page.goto(base+'/ad-report');
 await waitForColor('red');
 assert.match(await banner.locator('.notice').innerText(), /dominio reportado/);
 assert.ok(!external.includes(reported));
 const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({url}))[0].id,base+'/ad-report');
 const badge=()=>worker.evaluate(id=>chrome.action.getBadgeText({tabId:id}),tabId);
 assert.equal(await badge(),'!');
 await banner.evaluate(element=>element.remove());
 assert.equal(await badge(),'!');
 await page.goto(base+'/reload');
 assert.notEqual(await badge(),'!');
 for(let i=0;i<3;i++) {
  await page.waitForTimeout(450);
  await page.reload();
 }
 await waitForColor('amber');
 assert.equal(await banner.locator('h2').innerText(),'Recargas repetidas');
 await page.goto(base+'/normal');
 await page.goto(base+'/reload?step=0');
 for(let step=1;step<=3;step++){
  await page.waitForTimeout(450);
  await Promise.all([
   page.waitForURL(base+'/reload?step='+step),
   page.evaluate(url=>location.replace(url),base+'/reload?step='+step)
  ]);
 }
 await waitForColor('amber');
 assert.equal(await banner.locator('h2').innerText(),'Recargas repetidas');
 await panel.locator('.manual summary').click();
 await panel.locator('#link-input').fill(base+'/normal');
 await panel.locator('#link-form button[type=submit]').click();
 await panel.locator('#review-signal[data-level=neutral]').waitFor();
 await panel.locator('.manual summary').click();
 await panel.locator('#link-input').fill('https://registro.example/es/register?ref_code=demo&click_id=demo');
 await panel.locator('#link-form button[type=submit]').click();
 await panel.locator('#review-signal[data-level=amber]').waitFor();
 assert.match(await panel.locator('#review-reasons').innerText(),/Registro con seguimiento publicitario/);
 await panel.locator('.manual summary').click();
 await panel.locator('#link-input').fill('https://'+reported+'/');
 await panel.locator('#link-form button[type=submit]').click();
 await panel.locator('#review-signal[data-level=red]').waitFor();
 console.log('PASS: encuesta visible y controles, publicidad, registros, reputación, recargas y semáforo del panel');
} finally {
 await context.close();
}
