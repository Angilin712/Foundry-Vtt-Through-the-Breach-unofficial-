import json,re,hashlib
from pathlib import Path
import pypdfium2 as pdfium
from PIL import Image,ImageDraw
r=Path('research/bestiary');rows=json.loads((r/'catalogue-prepared.json').read_text(encoding='utf-8'));rows=[x for x in rows if not x.get('specialProfile')]
man={x['key']:x for x in json.loads((r/'manifest.json').read_text(encoding='utf-8'))}; modern={x['name']:x for x in rows}
specs=[
('book-02',177,'Swarm of Biting Midges',[-5,3,3,-5,-5,-5,-5,1],[5,6,1,3,3,7,5,0],5,'Living, Beast, Defiant, Swarm',{'martialArts':2,'wilderness':2},'bayou',None),
('book-02',185,'Gupp Swarm',[-1,3,2,-3,-5,-2,1,2],[4,5,1,3,4,6,5,0],5,'Living, Beast, Swampfiend',{'acrobatics':1,'athletics':2,'martialArts':1,'notice':1,'stealth':2,'track':1,'wilderness':1},'bayou','Gupp'),
('book-05',156,'Child of Saracenar',[2,3,2,0,-2,1,3,1],[5,5,2,5,7,6,5,1],5,'Living, Aua, Cultist',{'history':4,'melee':3,'art':2,'homesteading':3,'husbandry':2,'notice':3,'track':3,'wilderness':3,'archery':2,'convince':2,'intimidate':3,'acrobatics':3,'athletics':2,'centering':5,'evade':3,'stealth':3,'toughness':1},'neutral',None),
('book-05',157,'Priest of Saracenar',[2,3,2,0,-2,1,3,1],[4,5,2,5,7,6,8,1],7,'Living, Aua, Cultist',{'history':4,'heavyMelee':3,'art':4,'notice':3,'wilderness':3,'sorcery':4,'convince':4,'deceive':3,'intimidate':4,'leadership':4,'scrutiny':3,'athletics':2,'centering':5,'toughness':4},'neutral',None),
('book-09',169,'Tooth Fairy Swarm',[0,2,3,-2,-5,-5,1,-4],[5,6,1,4,2,7,6,0],6,'Nightmare, Swarm',{'grappling':1,'doctor':1,'evade':3,'notice':1,'lockpicking':1,'acrobatics':3,'pickpocket':1,'stealth':2},'neverborn',None),
('book-10',185,'Mindless Zombie Horde',[1,-3,-3,0,-5,-5,-5,-5],[2,3,2,-3,2,3,8,0],8,'Undead, Swarm',{'pugilism':2},'resurrectionists','Laborer Zombie'),
('book-10',203,'Angry Mob',[2,2,1,0,0,-1,-2,3],[3,5,2,3,5,5,8,0],8,'Living',{'athletics':1,'carouse':2,'flexible':2,'intimidate':2,'melee':2,'notice':2,'pugilism':2,'track':2},'neutral',None),
('book-13',363,'Орда Безмозглый зомби',[1,-3,-3,0,-5,-5,-5,-5],[2,3,2,-3,2,3,8,0],8,'Нежить, Толпа',{'pugilism':2},'resurrectionists','Безмозглый зомби'),
('book-13',392,'Рой Паровых арахнидов',[0,1,1,0,-5,-5,-5,-5],[4,5,1,1,2,5,8,0],8,'Конструкт, Рой',{'evade':3,'pneumatic':4,'stealth':1},'arcanists','Паровой арахнид')]
thumbs=[]
for book,page,name,aspects,stats,rank,tags,skills,faction,artMatch in specs:
 template=next(x for x in rows if x['book']==book)
 text=re.sub(r'\r+\n','\n',json.loads((r/(book+'.json')).read_text(encoding='utf-8'))[page-1]).replace('\ufffe','').replace('−','-');start=text.rfind(name+'\n');assert start>=0,name
 raw=text[start:];raw=re.split(r'\n\d+\s+(?:Chapter|Глава)',raw)[0]
 if name=='Mindless Zombie Horde':raw=raw.split('\nRevenant')[0]
 swarm='Saracenar' not in name
 row={'key':hashlib.sha256((book+':'+str(page)+':'+name).encode()).hexdigest()[:16],'name':name,'book':book,'file':man[book]['file'],'page':page,'side':1,'rank':rank,'tags':tags,'faction':faction,'aspects':dict(zip(['might','grace','speed','resilience','charm','intellect','cunning','tenacity'],aspects)),'stats':dict(zip(['defense','walk','height','initiative','willpower','charge','wounds','armor'],stats)),'skills':{k:{'rank':v,'suits':'T' if 'Saracenar' in name and k in ['melee','heavyMelee','archery','sorcery'] else ''} for k,v in skills.items()},'raw':raw,'bookLabel':template['bookLabel'],'printedPage':page-(3 if book=='book-02' else 2),'specialProfile':True,'rankWounds':swarm,'rankDefense':not swarm,'immuneWillpower':name in ['Angry Mob','Mindless Zombie Horde','Орда Безмозглый зомби','Рой Паровых арахнидов'],'immunePulse':'арахнидов' in name,'swarmAreaReduction':1 if 'арахнидов' in name else 0}
 row['reference']=f"{row['bookLabel']}, стр. {row['printedPage']} (PDF {page})"
 row['setup']='Ранг заменяет ранения. Обычный положительный урон уменьшает его на 1, взрыв/импульс — на полный урон; особенности бронированного роя учитываются автоматически. При ранге 0 рой распадается. Изменение размера, переменный урон атак и остальные способности разрешайте по описанию.' if swarm else 'Начальный ранг указан при Горении 0. По способности To Ashes мастер вручную увеличивает ранг на значение Горения, максимум на 5; при снятии Горения возвращает базовый ранг. Снижение урона от Горения и Fiery Demise разрешаются по описанию.'
 if name=='Swarm of Biting Midges':row['setup']+=' Navigation 1 отсутствует среди навыков второй редакции; используйте описание исходного профиля.'
 if name=='Angry Mob':row['setup']+=' Проверки неизученных навыков запрещены; мастер контролирует это ограничение.'
 if artMatch:
  row.update(portrait=modern[artMatch]['portrait'],artSource='Обобщённая иллюстрация родственного существа: '+artMatch,artGeneric=True)
 else:
  doc=pdfium.PdfDocument(row['file']);pg=doc[page-1];pw,ph=pg.get_size();c=[]
  for ix,obj in enumerate(pg.get_objects(filter=[pdfium.raw.FPDF_PAGEOBJ_IMAGE],max_depth=15)):
   x0,y0,x1,y1=obj.get_bounds();w,h=x1-x0,y1-y0
   if w>=85 and h>=95 and w*h<pw*ph*.85 and h/w>.35:c.append((w*h,ix,obj))
  assert c,name
  _,ix,obj=max(c,key=lambda x:x[0]);img=obj.get_bitmap(render=True,scale_to_original=True).to_pil();file=f'{book}-{page}-{ix}.webp';img.save(Path('through-the-breach/assets/bestiary/portraits')/file,quality=88,method=1)
  row.update(portrait='assets/bestiary/portraits/'+file,artSource=f'Иллюстрация страницы {page} PDF: '+row['bookLabel'],artGeneric=False)
  th=img.convert('RGB');th.thumbnail((220,230));tile=Image.new('RGB',(240,265),'white');tile.paste(th,((240-th.width)//2,0));ImageDraw.Draw(tile).text((4,236),name[:30],fill='black');thumbs.append(tile)
  pg.close();doc.close()
 rows.append(row)
# The Bayou PDF has three preliminary pages, unlike the other second-edition books.
for row in rows:
 if row['book']=='book-02':
  row['printedPage']=row['page']-3;row['reference']=f"{row['bookLabel']}, стр. {row['printedPage']} (PDF {row['page']})"
(r/'catalogue-prepared.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
contact=Image.new('RGB',(240*len(thumbs),265),'white')
for i,im in enumerate(thumbs):contact.paste(im,(i*240,0))
contact.save('output/special-art-contact.png')
print('Prepared',len(rows))
