import {ID,SKILLS,ASPECTS,SUITS,assert,integer,makeFateDeck,makeTwistDeck,derived} from './rules.mjs';
import {actorFor,createStack,setupActor,stack,drawHand} from './cards.mjs';
export const CREATION_OPS=['creationStart','creationSave','creationApply','catalogBuy','catalogImport','sessionStart'];
const clone=o=>foundry.utils.deepClone(o);
let tarotCache;
export async function tarotTables(){return tarotCache??=await fetch(`systems/${ID}/data/tarot.json`).then(r=>{assert(r.ok,'Не удалось загрузить таблицы Таро.');return r.json();});}
export const catalogMeta=i=>i.flags?.[ID]?.catalog??{};
export async function repairCreatedPursuit(actor){
 if(!actor.getFlag(ID,'creation')?.complete)return;
 const wrongId=actor.system.currentPursuitId,current=actor.items.get(wrongId);
 if(current?.system.category==='pursuit')return;
 const pursuits=actor.items.filter(i=>catalogMeta(i).kind==='pursuit');
 const progress=actor.system.pursuitProgress;
 if(pursuits.length!==1||!progress.some(x=>x.id===wrongId&&x.step===0)||progress.some(x=>x.id===wrongId&&x.step!==0))return;
 const pursuit=pursuits[0];
 await actor.update({'system.currentPursuitId':pursuit.id,'system.pursuitProgress':progress.map(x=>x.id===wrongId?{...x,id:pursuit.id}:x)});
}
export async function catalogDocuments(name){const pack=game.packs.get(`${ID}.${name}`);assert(pack,'Библиотека ещё не загружена: полностью перезапустите Foundry.');return pack.getDocuments();}
async function catalogItem(uuid){
 const match=/^Compendium\.through-the-breach\.(skills|stations|pursuits|talents|equipment|magic)\.Item\.([A-Za-z0-9]{16})$/.exec(String(uuid));
 assert(match,'Выберите запись из библиотеки системы.');const doc=await game.packs.get(`${ID}.${match[1]}`)?.getDocument(match[2]);assert(doc,'Запись библиотеки не найдена.');return doc;
}
export function blankCharacter(actor){return actor.type==='fated'&&!actor.items.size&&Object.values(actor.system.skills).every(s=>s.rank===0)&&Object.values(actor.system.aspects).every(n=>n===0)&&!actor.getFlag(ID,'creation')?.complete;}
function assign(values,keys,choices,label){
 assert(Array.isArray(choices)&&choices.length===keys.length,`Распределите все значения: ${label}.`);
 const numbers=choices.map(v=>integer(v,-5,4));assert(JSON.stringify([...numbers].sort((a,b)=>a-b))===JSON.stringify([...values].sort((a,b)=>a-b)),`Набор значений ${label} не совпадает с картой Таро.`);
 return Object.fromEntries(keys.map((k,i)=>[k,numbers[i]]));
}
export function creationPlan(draft,form,tables,catalog){
 assert(draft?.cards?.length===5&&!draft.complete,'Нет незавершённого расклада Таро.');
 const rows=draft.cards.map(c=>tables[`${c.value}-${c.suit}`]);assert(rows.every(Boolean),'Неизвестная карта Таро.');
 let mind=rows[3].mind;
 if(mind.includes(null)){assert(form.mindCorrectionConfirmed,'У туза Воронов в книге отсутствует число: требуется решение мастера.');mind=mind.map(v=>v===null?integer(form.mindCorrection,-5,4):v);}
 const aspects={...assign(rows[1].body,Object.keys(ASPECTS).slice(0,4),form.body,'Тело'),...assign(mind,Object.keys(ASPECTS).slice(4),form.mind,'Разум')};
 const ranks=Object.fromEntries(Object.keys(SKILLS).map(k=>[k,0]));
 for(const [kind,row] of [['root',rows[2]],['endeavor',rows[4]]]){
  assert(Array.isArray(form[kind])&&form[kind].length===row[kind].length,'Назначьте каждый ранг навыка.');
  form[kind].forEach((key,i)=>{assert(key in SKILLS&&!ranks[key],'Каждый начальный навык выбирается один раз; наборы Врождённой карты и Усилий не пересекаются.');ranks[key]=row[kind][i];});
 }
 const station=rows[0].station;const stationSkill=ranks[station.skill]?form.stationSkill:station.skill;
 assert(stationSkill in SKILLS&&!ranks[stationSkill],'Если навык Станции уже изучен, выберите другой необученный навык.');ranks[stationSkill]=1;
 assert(Array.isArray(form.mods)&&form.mods.length<=2,'Не более двух модификаций.');
 for(const mod of form.mods){if(!mod)continue;if(mod.startsWith('aspect.')){const key=mod.slice(7);assert(key in ASPECTS&&aspects[key]<3,'Модификация аспекта: +1, максимум 3.');aspects[key]++;}else {assert(mod in SKILLS&&!ranks[mod],'Модификация навыка даёт ранг 2 только необученному навыку.');ranks[mod]=2;}}
 makeTwistDeck(form.twist);
 const get=(uuid,kind)=>{const item=catalog.find(i=>i.uuid===uuid);assert(item&&catalogMeta(item).kind===kind,`Выберите запись типа ${kind} из библиотеки.`);return item;};
 const pursuit=get(form.pursuit,'pursuit'),talent=get(form.talent,'general');
 assert(form.requirementsConfirmed,'Проверьте требования выбранного общего таланта по его описанию.');
 const starter=Array.isArray(form.starter)?form.starter:[],bought=Array.isArray(form.bought)?form.bought:[];
 assert(starter.length<=10&&bought.length<=30,'Слишком много начальных предметов.');
 const equipment=uuids=>uuids.map(uuid=>{const item=catalog.find(i=>i.uuid===uuid);assert(item?.type==='equipment'&&catalogMeta(item).kind,'Выберите предмет из библиотеки снаряжения.');return item;});
 const free=equipment(starter),paid=equipment(bought),startKind=catalogMeta(pursuit).starter;
 const cost=list=>list.reduce((sum,i)=>sum+Number(i.system.price),0);
 assert(Number.isFinite(cost(paid))&&cost(paid)<=10,'Начальные покупки превышают 10 скрипов.');
 if(startKind==='toolkit')assert((free.length===1&&catalogMeta(free[0]).kind==='toolkit')||(catalogMeta(pursuit).key==='pursuit-3'&&!free.length&&form.manualStarterConfirmed),'Стремление даёт один немагический набор; альтернативный пневматический старт Ударника пока оформляет мастер.');
 else if(startKind==='pistols')assert(free.length>=1&&free.length<=2&&free.every(i=>i.system.isWeapon&&i.system.skill==='pistol')&&cost(free)<=20,'Старт Ганфайтера: один или два пистолета общей стоимостью до 20 скрипов.');
 else if(['closeArmor','rangedArmor'].includes(startKind)){
  const group=startKind==='closeArmor'?'close':'ranged';assert(free.filter(i=>i.system.isWeapon).length===1&&free.every(i=>i.system.isWeapon?SKILLS[i.system.skill]?.group===group:catalogMeta(i).kind==='armor')&&cost(free)<=20,'Стартовое имущество: одно подходящее оружие и броня, всего до 20 скрипов.');
 }else if(startKind==='grimoire')assert(!free.length,'Стартовый гримуар формируется отдельно от бесплатного снаряжения.');
 else assert(!free.length&&form.manualStarterConfirmed,'Конструкт или особый старт оформляет мастер отдельно по книге.');
 const step0=catalog.find(i=>catalogMeta(i).kind==='step0'&&catalogMeta(i).pursuit===catalogMeta(pursuit).key);assert(step0,'Не найден талант шага 0.');
 const documents=[pursuit,step0,talent,...free,...paid].map(i=>{const data=i.toObject();delete data._id;delete data.folder;delete data.ownership;delete data._stats;data.flags??={};data.flags[ID]??={};data.flags[ID].sourceUuid=i.uuid;
  if(data.type==='equipment'){data.system.quantity=1;if(data.system.isWeapon&&data.system.capacity>0){const ammo=Math.max(10,5*data.system.capacity);data.system.loaded=data.system.capacity;data.system.reserve=ammo-data.system.capacity;}}
  return data;});
 if(startKind==='grimoire'){
  assert(Array.isArray(form.magia)&&form.magia.length===2&&new Set(form.magia).size===2,'Выберите две разные Магии начального гримуара.');
  assert(Array.isArray(form.immuto)&&form.immuto.length===3&&new Set(form.immuto).size===3,'Выберите три разных Иммуто начального гримуара.');
  const magia=form.magia.map(uuid=>get(uuid,'magia')),immuto=form.immuto.map(uuid=>get(uuid,'immuto'));
  const school=catalogMeta(pursuit).key==='pursuit-2'?'sorcery':'necromancy';assert(magia.filter(i=>i.system.skill===school).length===1,'Одна Магия должна соответствовать Стремлению, вторая — другой магической школе.');
  documents.push({name:`Начальный гримуар · ${pursuit.name}`,type:'magic',system:{magicKind:'grimoire',description:'Две Магии и три Иммуто, выбранные при создании. Настройка выполняется в листе.',attuned:false},flags:{[ID]:{catalog:{kind:'creationGrimoire'}}}});
  for(const i of [...magia,...immuto]){const data=i.toObject();delete data._id;delete data.folder;delete data.ownership;delete data._stats;data.flags[ID].sourceUuid=i.uuid;data.flags[ID].creationGrimoireMember=true;documents.push(data);}
 }
 const fate=['endeavor','mind','root','body','station'].map((kind,i)=>rows[4-i].fate[kind]).join(' ');
 const update={'system.aspects':aspects,'system.twist':form.twist,'system.station':station.name,'system.pursuit':pursuit.name,'system.fate':fate,'system.notes':String(form.notes??''),'system.scrip':Math.round((10-cost(paid))*100)/100,'system.xp':0,'system.autoArmor':true};
 for(const [k,rank] of Object.entries(ranks))update[`system.skills.${k}.rank`]=rank;
 const wounds=derived({aspects,skills:Object.fromEntries(Object.entries(ranks).map(([k,rank])=>[k,{rank}])),bonuses:Object.fromEntries(['defense','willpower','wounds','initiative','walk','charge'].map(k=>[k,0])),armor:0,autoArmor:false,temporaryAspects:{}}).wounds;
 update['system.wounds.value']=wounds;
 return {update,documents,pursuit,manualStarter:startKind==='manual'};
}
export async function executeCreation(user,p){
 assert(user?.active,'Пользователь не подключён.');
 if(p.op==='sessionStart'){
  assert(user.isGM,'Пролог проводит мастер.');const session=String(p.session??'').trim();assert(session&&session.length<=120&&!['__proto__','constructor','prototype'].includes(session),'Введите название сессии.');
  const ledger=game.settings.get(ID,'sessions');ledger[session]??={actors:{}};
  assert(Array.isArray(p.actorIds)&&p.actorIds.length&&new Set(p.actorIds).size===p.actorIds.length,'Выберите участников.');
  const actors=p.actorIds.map(id=>actorFor(user,id));
  for(const a of actors){assert(a.type==='fated'&&stack('hand',a.id),'Каждому участнику нужна личная колода.');assert(!ledger[session].actors[a.id]||ledger[session].actors[a.id]==='done','Пролог был прерван: сверить руки вручную, повторная раздача заблокирована.');const d=stack('twist',a.id),discard=stack('twistDiscard',a.id);assert(d&&discard&&d.availableCards.length+discard.cards.size>=3,'В личной колоде не хватает карт.');}
  for(const a of actors){if(ledger[session].actors[a.id]==='done')continue;ledger[session].actors[a.id]='pending';await game.settings.set(ID,'sessions',ledger);await drawHand(a,3);ledger[session].actors[a.id]='done';await game.settings.set(ID,'sessions',ledger);}return;
 }
 const actor=actorFor(user,p.actorId,p.actorUuid);assert(!actor.system.operationPending,'Сначала мастер должен сверить и восстановить прерванную операцию.');
 let draft=actor.getFlag(ID,'creation');
 if(p.op==='creationStart'){
  if(draft){assert(!draft.pending,'Расклад прерван. Мастер должен сверить отдельную колоду Таро.');return draft;}
  assert(blankCharacter(actor),'Помощник рассчитан на пустой новый лист Сужденного.');
  assert(!stack('twist',actor.id),'У этого листа уже есть личная колода. Создайте новый пустой лист для помощника Таро.');
  await actor.setFlag(ID,'creation',{pending:true,cards:[]});
  const deck=await createStack('creationTarot',`${actor.name} · Таро создания`,'deck',actor.id,makeFateDeck());const spread=await createStack('creationSpread',`${actor.name} · Расклад создания`,'pile',actor.id);
  await deck.shuffle({chatNotification:false});const cards=await spread.draw(deck,5,{chatNotification:false});
  draft={cards:cards.map(c=>({cardId:c.id,value:c.value,suit:c.suit})),form:{},pending:false,complete:false};await actor.setFlag(ID,'creation',draft);return draft;
 }
 if(p.op==='creationSave'){assert(draft&&!draft.complete&&!draft.pending,'Нет открытого расклада.');const data=clone(p.form);assert(JSON.stringify(data).length<=20000,'Слишком большой черновик.');return actor.setFlag(ID,'creation',{...draft,form:data});}
 if(p.op==='creationApply'){
  assert(blankCharacter(actor)&&!draft?.pending,'Создание уже завершено либо лист содержит данные.');
  assert(!stack('twist',actor.id),'Личная колода уже существует. Сначала мастер должен сверить её с раскладом.');
  const spread=stack('creationSpread',actor.id);assert(spread?.cards.size===5&&draft?.cards?.length===5&&new Set(draft.cards.map(c=>c.cardId)).size===5&&draft.cards.every(c=>{const native=spread.cards.get(c.cardId);return native&&native.value===c.value&&native.suit===c.suit;}),'Черновик не совпадает с сохранёнными мастером картами Таро.');
  const catalog=(await Promise.all(['pursuits','talents','equipment','magic'].map(catalogDocuments))).flat();const plan=creationPlan(draft,p.form,await tarotTables(),catalog);
  await actor.update({'system.operationPending':'Создание персонажа: сверить предметы и поля, не повторять автоматически'});
  const items=await actor.createEmbeddedDocuments('Item',plan.documents);const pursuit=items.find(i=>catalogMeta(i).kind==='pursuit');
  assert(pursuit?.system.category==='pursuit','Созданное Стремление не найдено: мастер должен сверить лист перед продолжением.');
  const grimoire=items.find(i=>catalogMeta(i).kind==='creationGrimoire');if(grimoire)await actor.updateEmbeddedDocuments('Item',items.filter(i=>i.flags[ID]?.creationGrimoireMember).map(i=>({_id:i.id,'system.grimoireId':grimoire.id})));
  await actor.update({...plan.update,'system.currentPursuitId':pursuit.id,'system.pursuitProgress':[{id:pursuit.id,step:0}]});
  await setupActor(actor);await actor.setFlag(ID,'creation',{...draft,form:clone(p.form),complete:true,manualStarter:plan.manualStarter});await actor.update({'system.operationPending':''});return;
 }
 const source=await catalogItem(p.uuid),meta=catalogMeta(source);
 if(meta.kind==='skill'){
  assert(p.op==='catalogImport'&&user.isGM,'Начальные ранги распределяются помощником; дальнейшее повышение — через эпилог.');return actor.update({[`system.skills.${meta.skill}.aspect`]:source.system.skill===meta.skill?SKILLS[meta.skill].aspect:actor.system.skills[meta.skill].aspect});
 }
 assert(p.op==='catalogBuy'||(p.op==='catalogImport'&&user.isGM),'Бесплатное добавление записей подтверждает мастер.');
 const quantity=integer(p.quantity??1,1,99),price=Number(source.system.price);
 const cost=p.op==='catalogBuy'?Math.round(price*quantity*100)/100:0;
 assert(p.op!=='catalogBuy'||source.type==='equipment','Покупать можно снаряжение.');assert(Number.isFinite(cost)&&cost>=0&&actor.system.scrip>=cost,'Недостаточно скрипов.');
 const data=source.toObject();delete data._id;delete data.folder;delete data.ownership;delete data._stats;data.system.quantity=quantity;data.flags[ID].sourceUuid=source.uuid;
 await actor.update({'system.operationPending':'Добавление из библиотеки: сверить предмет и скрипы'});await actor.createEmbeddedDocuments('Item',[data]);await actor.update({'system.scrip':Math.round((actor.system.scrip-cost)*100)/100,'system.operationPending':''});
}
