import {readFile} from 'node:fs/promises';
import {connectDatabase} from './db.js';
const db=await connectDatabase();
try {for(const name of ['001_schema.sql','002_expand_content.sql','003_private_summaries.sql'])await db.exec(await readFile(new URL('../db/'+name,import.meta.url),'utf8'));console.log('Esquema inicializado.');}finally{await db.close();}
