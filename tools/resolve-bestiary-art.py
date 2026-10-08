"""Curated illustration selection, after visual inspection of PDF objects."""
from pathlib import Path
import json
import pypdfium2 as p

root=Path(__file__).resolve().parents[1];r=root/'research/bestiary';dest=root/'through-the-breach'
rows=json.loads((r/'catalogue-prepared.json').read_text(encoding='utf-8'))
manifest={x['key']:x for x in json.loads((r/'manifest.json').read_text(encoding='utf-8'))}
docs={}
def extract(book,page,index):
    rel=f'assets/bestiary/portraits/{book}-{page}-{index}.webp'
    if (dest/rel).exists() and (dest/rel).stat().st_size > 0:return rel
    doc=docs.setdefault(book,p.PdfDocument(root/manifest[book]['file']));pg=doc[page-1]
    obj=list(pg.get_objects(filter=[p.raw.FPDF_PAGEOBJ_IMAGE],max_depth=15))[index]
    obj.get_bitmap(render=True,scale_to_original=True).to_pil().save(dest/rel,quality=88,method=1)
    pg.close();return rel

# Objects that looked like portraits by their bounding box were actually panel art.
for row in rows:
    if row['book']=='book-13' and row['page']==366:row['portrait']=extract('book-13',366,1)
    if row['book']=='book-04' and row['page']==204:
        row['portrait']='';row['artSource']='На странице профиля нет отдельного портрета.'
exact={
 'Fingers Leong':('book-02',199,1),'Killjoy':('book-04',203,1),
 'Klaus Norwood':('book-09',160,1),'Francisco Ortega':('book-10',206,1),
 'Леопольд фон Шилль':('book-13',409,1),'Mature Nephilim':('book-13',368,1),
 'Гамин':('book-03',243,2),'Голем':('book-03',243,1)
}
for row in rows:
    if row['name'] in exact and not row['portrait']:
        b,page,index=exact[row['name']];row['portrait']=extract(b,page,index)
        row['artSource']=f'Иллюстрация из {manifest[b]["file"]}, PDF {page}.'
generic={
 'Guild Austringer':'Охотник Гильдии','Medical Assistant':'Медсестра',
 'Socialite Zombie':'Гнилая красавица','Soldier Zombie':'Зомби-мечник',
 'Homunculus':'Basic Gamin','Bellhop Porter':'Страж','Member of the Society':'Каталанский стрелок',
 'Mindless Zombie':'Laborer Zombie','Безмозглый зомби':'Laborer Zombie',
 'Отморозки':'Бандит','Emeline Bellerose':'Гнилая красавица','Montresor':'Окованный дух','Corpse Candle':'Окованный дух'
}
for row in rows:
    if not row['portrait'] and row['name'] in generic:
        template=next(x for x in rows if x['name']==generic[row['name']] and x['portrait'])
        row['portrait']=template['portrait'];row['artGeneric']=True
        row['artSource']=f'Обобщённый образ: иллюстрация «{template["name"]}», {template["reference"]}. Портрет можно заменить в листе.'
    if row['name']=='Malisaurus Rex' and (dest/'assets/bestiary/portraits/malisaurus-rex-wyrd.jpg').exists():
        row['portrait']='assets/bestiary/portraits/malisaurus-rex-wyrd.jpg'
        row['artSource']='Wyrd: https://www.wyrd-games.net/news/2020/6/10/waldos-weekly-welcome-to-the-jungle'
remaining=[x['name'] for x in rows if not x['portrait']]
(r/'catalogue-prepared.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
print('Unresolved portraits:',remaining)


