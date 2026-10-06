"""Extract creation tables from the supplied Russian book; never publish the PDF."""
from pathlib import Path
import json, re
import pdfplumber

root = Path(__file__).resolve().parents[1]
out = root / 'through-the-breach/data'
out.mkdir(exist_ok=True)
skill_rows = [
 ['counterspelling','shotgun','culinary','athletics','stealth','barter','blacksmithing','scrutiny','track','bureaucracy','intimidate','leadership','literacy','pistol'],
 ['engineering','explosives','history','enchanting','mathematics','printing','pneumatic','notice','alchemistry','acrobatics','melee','engineering','artefacting','sorcery'],
 ['carouse','centering','evade','prestidigitation','heavyGuns','wilderness','stitching','toughness','athletics','husbandry','longArms','art','doctor','necromancy'],
 ['carouse','forgery','bewitch','music','homesteading','pickpocket','stitching','barter','wilderness','lockpicking','deceive','gambling','convince','martialArts']]
tarot = {}
def key(text):
 text = text.replace('\n','').replace(' ','')
 if 'Красный' in text or text=='RedJoker': return '14-'
 if 'Черный' in text or 'Чёрный' in text: return '0-'
 m = re.fullmatch(r'(A|\d+)([RtcM])', text)
 assert m, text
 return f"{1 if m[1]=='A' else int(m[1])}-" + {'R':'rams','t':'tomes','c':'crows','M':'masks'}[m[2]]
with pdfplumber.open(root / 'Сквозь пролом (Through the Breach) — основная книга.pdf') as book:
 for kind, start in [('station',84),('body',86),('root',88),('mind',90),('endeavor',92)]:
  count=0
  for n in [start,start+1]:
   table=book.pages[n-1].extract_tables()[0]
   for row in table[1:]:
    if not row[0] or row[0].strip()=='Джокер':
     if row[-1] and kind=='station': entry['fate'][kind]+=' '+row[-1].replace('\n',' ')
     continue
    k=key(row[0]); entry=tarot.setdefault(k, {'value':int(k.split('-')[0]),'suit':k.split('-')[1], 'fate':{}})
    entry['fate'][kind]=row[-1].replace('\n',' ').strip()
    if kind=='station':
     suit=entry['suit']; group={'rams':0,'tomes':1,'crows':2,'masks':3}.get(suit,0 if entry['value']==14 else 2)
     entry[kind]={'name':row[1].replace('\n',' '),'skill':skill_rows[group][entry['value'] if suit else 0]}
    else:
     parts=re.split(r'[/,]',row[1].replace('\n','').replace(' ',''))
     entry[kind]=[None if x=='+' else int(x) for x in parts]
     assert len(entry[kind])==4 if kind in ['body','mind'] else 3<=len(entry[kind])<=7, row
    count+=1
  assert count==54,(kind,count)
 # The supplied book omits the digit; Yan explicitly corrected it to +3.
 assert tarot['1-crows']['mind']==[-3,0,0,None]
 tarot['1-crows']['mind']=[-3,0,0,3]
 tarot['13-crows']['station']['name']='Расхититель могил'
 tarot['13-crows']['fate']['station']='и предстанешь ты пред гранью жизни и смерти.'
 tarot['0-']['station']['name']='Рожденный в Байю'
 (out/'tarot.json').write_text(json.dumps(tarot,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 pursuits=[]
 names=['Академик','Преступник','Дабблер','Ударник','Расхититель могил','Страж','Ганфайтер','Наемник','Начальник','Артист','Пионер','Мастер рукопашной','Жестянщик','Аферист']
 groups=['academic','training','magic','training','magic','close','ranged','ranged','social','social','training','close','magic','expertise']
 cached={int(k):v for k,v in re.findall(r'=== PDF PAGE (\d+) ===(.*?)(?==== PDF PAGE|\Z)',(root/'research/book.txt').read_text(encoding='utf-8'),re.S)}
 for i,n in enumerate(range(102,155,4)):
  text=cached[n]; a=text.index('Начало игры'); b=text.index('Продвижение',a)
  rules=text[a:b]; m=re.search(r'\n0\s*([^\n]+)',text); assert m,(n,text)
  step0=m[1].strip(); following=cached[n+1]; first=following.find(step0+'\n'); steptext=''
  nextmatch=re.search(r'\n1\s+([^\n]+)',text)
  if first>=0 and nextmatch:
   nexttitle=nextmatch[1].split(' или ')[0].strip(); end=following.find(nexttitle+'\n',first+len(step0))
   if end>=0: steptext=following[first+len(step0):end].strip()
  pursuits.append({'key':f'pursuit-{i}','name':names[i],'group':groups[i],'reference':f'Основная книга, стр. {n-2}','description':rules,'step0':step0,'step0Description':steptext,'starter': 'grimoire' if i in [2,4] else 'toolkit' if 'набором инструментов' in rules else 'pistols' if i==6 else 'closeArmor' if i in [5,11] else 'rangedArmor' if i==7 else 'manual'})
 talents=[]
 for n in range(217,226):
  text=cached[n]
  matches=list(re.finditer(r'(?m)^([^\n]{3,90})\nТребовани[ея]:',text))
  for j,m in enumerate(matches):
   body=text[m.end():matches[j+1].start() if j+1<len(matches) else len(text)].strip()
   talents.append({'key':f'general-{len(talents)}','name':m[1].strip(),'description':'Требование: '+body,'reference':f'Основная книга, стр. {n-2}'})
 (out/'creation-catalog.json').write_text(json.dumps({'pursuits':pursuits,'talents':talents},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 magic=[]
 aspect_ids={'Хитрость':'cunning','Обаяние':'charm','Упорство':'tenacity','Интеллект':'intellect'}
 for n in range(266,274):
  page=book.pages[n-1]
  for table in page.find_tables():
   rows=table.extract()
   if rows[0]!=['Аспект','ОД','СЛ','Сопрот.','Дальность']: continue
   x0,y0,x1,y1=table.bbox
   title=page.crop((x0,max(0,y0-65),x1,y0)).filter(lambda c:c.get('object_type')=='char' and 17.9<=c.get('size',0)<=18.1).extract_text().replace('\n',' ').strip()
   assert title,(n,table.bbox)
   nexttops=[c['top'] for c in page.chars if 17.9<=c['size']<=18.1 and x0<=c['x0']<x1 and c['top']>y1+3]
   end=min(nexttops) if nexttops else page.height-50
   description=page.crop((x0,y1,x1,end)).extract_text()
   aspect,ap,tn,resistance,distance=rows[1]; match=re.fullmatch(r'(\d+)([RCtM]*)',tn)
   magic.append({'key':f'magia-{len(magic)}','name':title,'reference':f'Основная книга, стр. {n-2}','description':description,'system':{'magicKind':'magia','skill':['enchanting','necromancy','prestidigitation','sorcery'][(n-266)//2],'aspect':aspect_ids[aspect],'apCost':int(ap),'tn':int(match[1]) if match else 0,'required':match[2].upper() if match else '', 'equipped':bool(match),'resistance':{'Св':'willpower','Wp':'willpower','Защ':'defense','Df':'defense','-':''}[resistance],'range':distance},'variableTN':not bool(match)})
 (out/'magic-catalog.json').write_text(json.dumps(magic,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Tarot: {len(tarot)}; pursuits: {len(pursuits)}; general talent headings: {len(talents)}')
