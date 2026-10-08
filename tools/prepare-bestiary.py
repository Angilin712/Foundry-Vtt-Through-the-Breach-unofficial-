"""Prepare the RPG second-edition catalogue from locally extracted source tables.

The source PDFs and intermediate extraction files are deliberately not shipped.
Requires pypdfium2. Run from the project root after the source extraction audit.
"""
from pathlib import Path
import json, re, hashlib, collections
import pypdfium2 as pdfium

root = Path(__file__).resolve().parents[1]
research = root / 'research/bestiary'
dest = root / 'through-the-breach'
manifest = {x['key']: x for x in json.loads((research/'manifest.json').read_text(encoding='utf-8'))}
rows = json.loads((research/'parsed.json').read_text(encoding='utf-8'))
skills = json.loads((research/'skills.json').read_text(encoding='utf-8'))
books = {
 'book-13':'Основная книга', 'book-02':'Into the Bayou', 'book-03':'Into the Steam',
 'book-04':'Under Quarantine', 'book-05':'Onward!', 'book-09':'From Nightmares', 'book-10':'Above the Law'
}
aspects = ['might','grace','speed','resilience','charm','intellect','cunning','tenacity']
def clean(t):
    return re.sub(r'\r+\n','\n',t).replace('\ufffe','').replace('−','-')
def source(book,page):
    return clean(json.loads((research/(book+'.json')).read_text(encoding='utf-8'))[page-1])
def add(book,page,name,physical,mental,stats,rank,tags,setup=''):
    if any(x['book']==book and x['page']==page and x['name']==name for x in rows):return
    text=source(book,page)
    starts=list(re.finditer(re.escape(name)+r'\s*\n(?:Minion|Enforcer|Миньон)',text))
    raw=text[starts[-1].start():] if starts else text
    if book=='book-03':raw=text[text.index(name):]
    skill=re.search(r'(?:Skills|Навык[аи]?):\s*(.*?)(?:\.(?:\s|$)|\n\n)',raw,re.S)
    rows.append(dict(key=hashlib.sha256(f'{book}:{page}:{name}'.encode()).hexdigest()[:16],name=name,
      book=book,page=page,file=manifest[book]['file'],side=1,rank=rank,tags=tags,
      aspects=dict(zip(aspects,physical+mental)),stats=dict(zip(['defense','walk','height','initiative','willpower','charge','wounds'],stats)),
      skillsText=skill[1] if skill else '',raw=raw,setup=setup))

add('book-03',231,'Eccentric Inventor',[-1,1,1,1],[0,3,2,1],[4,5,2,4,4,6,6],7,'Living',
    'Базовый профиль без паровой сбруи. При надевании сбруи: Мощь 4, Скорость 0, Рост 3, Броня +1, тег Конструкт; открываются пневматические когти.')
add('book-13',326,'Стрелок гильдии',[1,0,0,0],[-1,2,1,2],[4,4,2,3,5,4,5],6,'Живой, Гвардеец')
add('book-13',108,'Отморозки',[2,1,0,2],[-3,2,-1,2],[4,4,2,1,4,4,6],5,'Живой')
add('book-13',334,'Сталкер-Колдун',[3,2,2,0],[-1,-1,-1,2],[5,5,2,4,5,6,6],6,'Живой, Охотник на ведьм, Колдун')
add('book-13',373,'Марионетка',[-1,2,2,0],[1,-3,2,3],[5,5,1,2,5,6,4],5,'Конструкт, Кукла')
add('book-13',392,'Паровой арахнид',[0,1,1,0],[-5,-5,-5,-5],[4,5,1,1,2,5,4],5,'Конструкт')
add('book-09',184,'Geryon',[4,1,0,3],[-5,-3,2,4],[0,4,3,0,6,6,13],7,'Living, Fae, Gigant')
add('book-05',160,'Hydric Silurid',[4,4,3,5],[-5,-2,2,2],[4,6,4,7,7,7,20],7,'Living, Beast, Swampfiend, Monstrous',
    'Начальное значение X = 0. Рост голов, бонусы X, регенерацию и слабости мастер применяет по описанию.')
add('book-05',162,'Elder Bandersnatch',[5,1,3,1],[-4,1,4,4],[5,6,4,6,6,7,20],7,'Living, Nightmare, Spirit, Umbra, Monstrous')

# Source aliases include older expansions' skill spellings. Unknown first-edition
# skills remain in the readable profile rather than being silently remapped.
def norm(s):return re.sub(r'[^a-zа-я0-9]','',s.lower().replace('ё','е'))
aliases={norm(k):k for k in skills}
aliases.update({norm(v['label']):k for k,v in skills.items()})
extra={
 'heavy melee':'heavyMelee','heavy guns':'heavyGuns','long arms':'longArms','thrown weapons':'thrown',
 'thrown weapon':'thrown','flexible':'flexible','pick pocket':'pickpocket','pistols':'pistol',
 'counter-spelling':'counterspelling','lock picking':'lockpicking','pneumatics':'pneumatic','toughess':'toughness',
 'Гибкое':'flexible','Тяжелое рукопашное':'heavyMelee','Длинноствольное':'longArms','Пистолет':'pistol',
 'Дробовик':'shotgun','Луки':'archery','Рукопашная':'melee','Атака куликами':'pugilism',
 'Жесткость':'toughness'
}
aliases.update({norm(k):v for k,v in extra.items()})
unknown=collections.Counter()
portrait_dir=dest/'assets/bestiary/portraits';portrait_dir.mkdir(parents=True,exist_ok=True)
docs={}
noart=[]
for row in rows:
    row['raw']=clean(row['raw'])
    # Armour must be an unconditional trait before the first action, not an effect
    # granting armour to another creature or creating a pillar.
    before=re.split(r'\n\(?[012345]\)\s',row['raw'])[0]
    armor=re.search(r'(?:^|\n)(?:Armor|Броня)\s*\+\s*(\d+)\s*:',row['raw'])
    row['stats']['armor']=int(armor[1]) if armor else 0
    if row['name']=='Eccentric Inventor':row['stats']['armor']=0
    if row['name']=='Паровой арахнид':row['stats']['armor']=1
    # Skill paragraphs may have line wrapping and soft hyphens.
    m=re.search(r'(?:Skills|Навык[аи]?):\s*(.*?)(?=\.(?:\s|$)|\n[^\n]+:|\n\(?[012345]\)\s|$)',row['raw'],re.S)
    text=m[1] if m else row['skillsText']
    text=re.sub(r'-\s*\n\s*','',text).replace('\n',' ')
    result={}
    for entry in text.split(','):
        m=re.match(r'\s*([A-Za-zА-Яа-яЁё -]+?)\s+(\d+)\s*([rctmRCTM]*)\s*$',entry)
        if not m:continue
        k=aliases.get(norm(m[1]))
        if k:result[k]={'rank':int(m[2]),'suits':m[3].upper()}
        else:unknown[m[1].strip()]+=1
    row['skills']=result
    row['bookLabel']=books[row['book']]
    row['printedPage']=row['page']-(3 if row['book']=='book-02' else 2)
    row['reference']=f"{row['bookLabel']}, стр. {row['printedPage']} (PDF {row['page']})"
    row['manualRules']=True
    # Extract actual illustration XObjects, excluding backgrounds and stat bars.
    doc=docs.setdefault(row['book'],pdfium.PdfDocument(root/row['file']))
    page=doc[row['page']-1];pw,ph=page.get_size();candidates=[]
    for ix,obj in enumerate(page.get_objects(filter=[pdfium.raw.FPDF_PAGEOBJ_IMAGE],max_depth=15)):
        x0,y0,x1,y1=obj.get_bounds();w=x1-x0;h=y1-y0
        if w<85 or h<95 or w>pw*1.2 or h>ph*1.1 or w*h>pw*ph*.85:continue
        if h/w<.35:continue
        # Illustrated portraits usually sit opposite their stat column.
        opposite=(((x0+x1)/2>pw/2) == (row['side']==0))
        score=w*h*(1.7 if opposite else 1)
        candidates.append((score,ix,obj))
    if candidates:
        _,ix,obj=max(candidates,key=lambda x:x[0])
        filename=f"{row['book']}-{row['page']}-{ix}.webp"
        target=portrait_dir/filename
        if not target.exists() or target.stat().st_size == 0:obj.get_bitmap(render=True,scale_to_original=True).to_pil().save(target,quality=88,method=1)
        row['portrait']=f'assets/bestiary/portraits/{filename}'
        row['artSource']=f"Иллюстрация страницы {row['page']} PDF: {row['bookLabel']}"
    else:
        noart.append({'key':row['key'],'name':row['name'],'book':row['book'],'page':row['page']})
        row['portrait']=''
        row['artSource']='Иллюстрация не найдена; требуется подбор портрета.'
    page.close()

(research/'catalogue-prepared.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
(research/'missing-portraits.json').write_text(json.dumps(noart,ensure_ascii=False,indent=2),encoding='utf-8')
(research/'unmapped-skills.json').write_text(json.dumps(unknown,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'count':len(rows),'missingPortraits':len(noart),'unknownSkills':unknown,'books':dict(collections.Counter(x['bookLabel'] for x in rows))},ensure_ascii=False))


