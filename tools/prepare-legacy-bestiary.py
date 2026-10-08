"""Adapt first-edition Almanac base profiles, preserving original rules as notes."""
from pathlib import Path
import json,re,hashlib,collections
r=Path('research/bestiary');rows=json.loads((r/'catalogue-prepared.json').read_text(encoding='utf-8'))
rows=[x for x in rows if x['book']!='book-07']
skills=json.loads((r/'skills.json').read_text(encoding='utf-8'))
norm=lambda s:re.sub('[^a-zа-я]','',s.lower().replace('ё','е'))
aliases={norm(k):k for k in skills};aliases.update({norm(v['label']):k for k,v in skills.items()})
aliases.update({norm(k):v for k,v in {'Pistols':'pistol','Pick Pocket':'pickpocket','Thrown Weapons':'thrown','Lock Picking':'lockpicking','Counter-Spelling':'counterspelling'}.items()})
classes='Peon|Minion|Enforcer|Henchman|Master|Tyrant'
texts=json.loads((r/'book-07.json').read_text(encoding='utf-8'))
modern={x['name']:x for x in rows};errors=[]
translated={
 'Guild Guard':'Гвардеец гильдии','Guild Hound':'Сторожевая собака','Guild Sergeant':'Сержант гвардии','Guild Rifleman':'Стрелок гильдии',
 'Guardian':'Страж','Hunter':'Охотник','Peacekeeper':'Миротворец','Riotbreaker':'Бунтоборец','Death Marshal':'Маршал смерти','Exorcist':'Экзорцист',
 'Witchling Handler':'Укротитель Колдунов','Convict Gunslinger':'Стрелок-каторжник','Desperate Mercenary':'Отчаявшийся наемник','Ronin':'Ронин',
 'Catalan Rifleman':'Каталанский стрелок','Freikorpsmann':'Фрайкормэн','Freikorps Librarian':'Библиотекарь Фрайкор',
 'Freikorps Specialist':'Ловец Фрайкор','Strongarm Suit':'Десантник-Дракон Фрайкор','Abomination':'Мерзость','Desolation Engine':'Орудие Опустошения',
 'Insidious Madness':'Коварное безумие','Sorrow':'Скорбь','Stitched Together':'Сшитые вместе','Doppelganger':'Бандит-Доплер',
 'Wicked Doll':'Порочная кукла','Marionette':'Марионетка','Rotten Belle':'Гнилая красавица','Punk Zombie':'Зомби-мечник','Hog Whisperer':'Помоенос'}
for page,text in enumerate(texts,1):
 text=re.sub(r'\r+\n','\n',text).replace('\ufffe','').replace('−','-')
 starts=list(re.finditer(r'^('+classes+r'),\s*([^\n]+)',text,re.M))
 for ix,start in enumerate(starts):
  block=text[start.start():starts[ix+1].start() if ix+1<len(starts) else len(text)]
  named=re.search(r'([^\n]+)\s*\(('+classes+r')\)\s*\nSkills:',block)
  if not named:continue
  name=named[1].strip()
  try:
   def value(label):
    m=re.search(r'(?:^|\n)'+('Wounds?' if label=='Wounds' else label)+r'\s*\n\s*([-+]?\d+|-)',block)
    if not m and label=='Tenacity' and name in ['Doppelganger','Spawn Mother']:
     return modern[translated.get(name,name)]['aspects']['tenacity']
    if not m:raise ValueError('Missing '+label)
    return 0 if m[1]=='-' else int(m[1])
   aspects={k:value(k.capitalize()) for k in ['might','grace','speed','resilience','charm','intellect','cunning','tenacity']}
   stats={k:value(label) for k,label in {'defense':'Defense','willpower':'Willpower','walk':'Walk','charge':'Charge','height':'Height','wounds':'Wounds','initiative':'Initiative'}.items()}
   armor=re.search(r'(?:Talents?:[^\n]*|^)(?:Armor|[^\n]* Armor)\s+(\d+)',block,re.M)
   stats['armor']=int(armor[1]) if armor else 0
   diffs=[int(m[2])-int(m[1]) for m in re.finditer(r'(?:AV:\s*|Defense\s*\n|Willpower\s*\n|Initiative\s*\n)\s*(\d+)[rctmRCTM]*\s*\((\d+)',block)]
   rank=collections.Counter(diffs).most_common(1)[0][0] if diffs else {'Peon':3,'Minion':5,'Enforcer':7,'Henchman':9,'Master':12,'Tyrant':14}[start[1]]
   skilltext=re.search(r'Skills:\s*(.*?)(?=\n(?:Talent|\(?\d\))|$)',block,re.S)[1]
   parsed={}
   for m in re.finditer(r'([A-Za-z -]+)\s*\((\d+)([rctmRCTM]*)\)',skilltext.replace('\n',' ')):
    key=aliases.get(norm(m[1]))
    if key:parsed[key]={'rank':int(m[2]),'suits':m[3].upper()}
   template=modern.get(name) or modern.get(translated.get(name,''))
   exact=bool(template)
   if not template:
    tags=start[2]
    template=modern['Зомби-мечник'] if 'Undead' in tags else modern['Молодой нефилим'] if 'Nephilim' in tags else modern['Страж'] if 'Construct' in tags else modern['Лошадь'] if 'Beast' in tags else modern['Гвардеец гильдии']
   faction='guild' if 138<=page<=160 else 'outcasts' if 162<=page<=174 else 'neverborn' if 176<=page<=190 else 'resurrectionists' if 194<=page<=196 else 'bayou' if 198<=page<=206 else 'neutral'
   rows.append(dict(key=hashlib.sha256(f'book-07:{page}:{name}'.encode()).hexdigest()[:16],name=name,book='book-07',bookLabel='Альманах мастера · архив 1-й редакции',page=page,printedPage=page-1,
    reference=f'Альманах мастера, 1-я редакция, стр. {page-1} (PDF {page})',faction=faction,rank=rank,tags=start[2],aspects=aspects,stats=stats,skills=parsed,skillsText=skilltext,
    raw=name+'\n'+block,portrait=template['portrait'],artGeneric=not exact,
    artSource=f'Иллюстрация «{template["name"]}»: {template["artSource"]}',
    setup='Архивный профиль первой редакции. Базовые характеристики адаптированы к текущему движку; исходный блок сохранён в описании. Старые таланты и отсутствующие в новой редакции навыки мастер разрешает вручную. Числа в скобках исходного блока могут отличаться от расчёта нового движка.'+(' Значение Упорства отсутствует в старой книге: использовано значение обновлённого профиля.' if name in ['Doppelganger','Spawn Mother'] else '')))
  except Exception as ex:errors.append((page,name,str(ex)))
(r/'catalogue-prepared.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
(r/'legacy-errors.json').write_text(json.dumps(errors,ensure_ascii=False,indent=2),encoding='utf-8')
print('Legacy profiles',sum(x['book']=='book-07' for x in rows),'Errors',errors)
