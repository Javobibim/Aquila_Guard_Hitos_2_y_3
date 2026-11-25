import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';

const source=import.meta.dirname;
const root=resolve(source,'../..');
const read=path=>readFile(join(root,path),'utf8');
const scripts=['shared/url-rules.js','shared/psl-data.js','shared/advanced.js','shared/engine.js','tools/windows/review.js'];
const [template,reports,...code]=await Promise.all(['tools/windows/review.html','data/reputation.json',...scripts].map(read));
const escapeEnd=value=>value.replace(/<\/script/gi,'<\\/script');
const bundle='<script type="application/json" id="reports">'+escapeEnd(reports)+'</script>\n'+
 code.map(script=>'<script>'+escapeEnd(script)+'</script>').join('\n');
const output=join(root,'dist/windows/review.html');
await mkdir(resolve(output,'..'),{recursive:true});
await writeFile(output,template.replace('<!-- AQUILA_BUNDLE -->',()=>bundle),'utf8');
console.log(output);
