from pathlib import Path
from urllib.request import Request, urlopen
import json,hashlib,datetime,re

root=Path(__file__).resolve().parent.parent
base='https://raw.githubusercontent.com/phishdestroy/destroylist/main/'
def get(name):
 with urlopen(Request(base+name,headers={'User-Agent':'AquilaGuard-academic-beta/0.6'}),timeout=60) as r:
  data=r.read(15*1024*1024+1)
  if len(data)>15*1024*1024:raise RuntimeError('Feed demasiado grande')
  return data
raw=get('list.json');items=json.loads(raw)
if not isinstance(items,list) or len(items)<1000:raise RuntimeError('Formato de fuente inesperado')
domains=[]
for item in items:
 if isinstance(item,str):
  value=item.lower().strip().rstrip('.')
  if len(value)<=253 and re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?',value) and '.' in value and '..' not in value and not value.endswith(('.example','.test','.invalid','.localhost')):domains.append(value)
domains=sorted(set(domains))
stamp=datetime.datetime.now(datetime.timezone.utc).isoformat()
result={'format':1,'source':'PhishDestroy primary','sourceUrl':base+'list.json','sourceLicense':'MIT','fetchedAt':stamp,'sha256Source':hashlib.sha256(raw).hexdigest(),'domains':domains}
(root/'data/reputation.json').write_text(json.dumps(result,ensure_ascii=True,separators=(',',':')),'utf-8')
(root/'data/LICENSE_PhishDestroy.txt').write_bytes(get('LICENSE'))
(root/'data/README.md').write_text('Instantánea de la lista primaria pública de PhishDestroy, con licencia MIT. Se conserva su licencia. No se incluye la lista comunitaria agregada. Un dominio listado puede ser un falso positivo o dejar de ser peligroso; la ausencia de coincidencia no demuestra seguridad. Las comprobaciones se realizan localmente y no visitan los dominios.\nFuente: '+base+'list.json\nDescarga: '+stamp+'\n','utf-8')
print(json.dumps({'domains':len(domains),'bytes':(root/'data/reputation.json').stat().st_size,'fetchedAt':stamp}))
