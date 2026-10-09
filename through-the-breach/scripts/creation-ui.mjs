import {ID,SKILLS,ASPECTS,SUITS,cardName,escapeHTML as e,assert} from './rules.mjs';
import {request,stack} from './cards.mjs';
import {tarotTables,catalogDocuments,catalogMeta} from './creation.mjs';
import {weaponRating} from './battle.mjs';
const options=(rows,value)=>rows.map(([k,label])=>`<option value="${e(k)}" ${String(k)===String(value)?'selected':''}>${e(label)}</option>`).join('');
const skillOptions=value=>options([['','Выберите навык'],...Object.values(SKILLS).map(s=>[s.id,s.label])],value);
async function dialog(title,content,label='Продолжить',draftButton=false,onRender){
 const form=(button,action)=>{const data=new FormData(button.form);if(action)data.set('creationAction',action);return data;};
 return foundry.applications.api.DialogV2.prompt({window:{title,resizable:true},position:{width:680},content:`<div class="ttb-dialog" style="max-height:70vh;overflow:auto">${content}</div>`,render:(_event,app)=>onRender?.(app.element),ok:{label,callback:(_event,button)=>form(button,draftButton?'complete':'')},buttons:draftButton?[{action:'draft',label:'Сохранить черновик',callback:(_event,button)=>form(button,'draft')}]:[],rejectClose:false});
}
export function draftWeaponRating(form,rows,item){
 const aspects=Object.fromEntries(Object.keys(ASPECTS).map((key,i)=>[key,Number(form.getAll(i<4?'body':'mind')[i%4]??0)]));
 const skills=Object.fromEntries(Object.values(SKILLS).map(s=>[s.id,{rank:0,aspect:s.aspect}]));
 for(const [kind,index] of [['root',2],['endeavor',4]])form.getAll(kind).forEach((k,i)=>{if(skills[k])skills[k].rank=rows[index][kind][i]??0;});
 const station=skills[rows[0].station.skill].rank?form.get('stationSkill'):rows[0].station.skill;if(skills[station]&&!skills[station].rank)skills[station].rank=1;
 for(const mod of form.getAll('mods')){if(mod.startsWith('aspect.')&&mod.slice(7) in aspects)aspects[mod.slice(7)]++;else if(skills[mod]&&!skills[mod].rank)skills[mod].rank=2;}
 return weaponRating({system:{aspects,skills}},item);
}
const label=(text,content)=>`<label>${e(text)}${content}</label>`;
export async function createCharacter(actor){
 if(!actor){assert(game.user.isGM,'Новый лист создаёт мастер.');const f=await dialog('Новый Сужденный',label('Имя','<input name="name" required>'),'Создать лист');if(!f)return;actor=await foundry.documents.Actor.create({name:String(f.get('name')).trim(),type:'fated'});actor.sheet.render({force:true});}
 assert(actor.isOwner&&actor.type==='fated','Выберите собственный лист Сужденного.');
 let draft=actor.getFlag(ID,'creation');if(!draft){await request({op:'creationStart',actorUuid:actor.uuid});draft=actor.getFlag(ID,'creation');if(!draft){ui.notifications.info('Мастер получил запрос на расклад. После его обработки снова откройте «Создание по Таро».');return;}}
 assert(!draft.complete,'Создание этого персонажа уже завершено.');assert(!draft.pending,'Расклад прерван: обратитесь к мастеру.');
 const tables=await tarotTables(),rows=draft.cards.map(c=>tables[`${c.value}-${c.suit}`]);const saved=draft.form??{};
 const [pursuits,talents,equipment,magic]=await Promise.all(['pursuits','talents','equipment','magic'].map(catalogDocuments));
 const equipmentOptions=[['','Не выбирать'],...equipment.map(i=>[i.uuid,`${i.name} · ${i.system.price}§`])];
 let html=`<p>Расклад сохранён. Порядок карт: Станция → Тело → Врождённая → Разум → Усилия.</p><ol>${draft.cards.map((c,i)=>`<li>${e(cardName(c))}: ${e(['Станция','Тело','Врождённая','Разум','Усилия'][i])}</li>`).join('')}</ol>`;
 for(const [kind,keys,index] of [['body',Object.keys(ASPECTS).slice(0,4),1],['mind',Object.keys(ASPECTS).slice(4),3]]){
  html+=`<h3>${kind==='body'?'Физические':'Ментальные'} аспекты</h3><p>Распределите набор: ${rows[index][kind].join(' / ')}.</p>`;
  keys.forEach((key,i)=>{html+=label(ASPECTS[key],`<select name="${kind}">${options([...new Set(rows[index][kind])].map(v=>[v,v]),saved[kind]?.[i]??rows[index][kind][i])}</select>`);});
 }
 for(const [kind,index,title] of [['root',2,'Врождённые навыки'],['endeavor',4,'Навыки Усилий']]){
  html+=`<h3>${title}</h3><p>Каждый навык выбирается только один раз, включая второй набор.</p>`;
  rows[index][kind].forEach((rank,i)=>{html+=label(`Ранг ${rank}`,`<select name="${kind}">${skillOptions(saved[kind]?.[i])}</select>`);});
 }
 html+=`<h3>Станция: ${e(rows[0].station.name)}</h3><p>Навык ${e(SKILLS[rows[0].station.skill].label)} получает ранг 1. Если вы уже выбрали его выше, укажите другой необученный навык.</p>`+label('Заменяющий навык',`<select name="stationSkill">${skillOptions(saved.stationSkill)}</select>`);
 html+='<h3>Две модификации</h3><p>Каждая: +1 к аспекту (до 3) или ранг 2 в необученном навыке. Можно оставить неиспользованной.</p>';
 for(let i=0;i<2;i++)html+=label(`Модификация ${i+1}`,`<select name="mods">${options([['','Не использовать'],...Object.entries(ASPECTS).map(([k,v])=>['aspect.'+k,'+1: '+v]),...Object.values(SKILLS).map(s=>[s.id,'Ранг 2: '+s.label])],saved.mods?.[i])}</select>`);
 html+='<h3>Стремление и общий талант</h3>'+label('Базовое Стремление',`<select name="pursuit">${options([['','Выберите Стремление'],...pursuits.map(i=>[i.uuid,i.name])],saved.pursuit)}</select>`)+label('Один общий талант',`<select name="talent">${options([['','Выберите талант'],...talents.filter(i=>catalogMeta(i).kind==='general').map(i=>[i.uuid,i.name])],saved.talent)}</select>`);
 html+='<p>Игрок завершает создание самостоятельно. Мастер может проверить и изменить готовый лист. Требования и условные эффекты талантов сверяются по описанию записи в библиотеке.</p>';
 html+=label('Требования общего таланта проверены по описанию',`<input type="checkbox" name="requirementsConfirmed" ${saved.requirementsConfirmed?'checked':''}>`);
 html+='<h3>Стартовое имущество Стремления</h3><p>Набор инструментов; для Ганфайтера 1–2 пистолета до 20§; для Стража/Мастера рукопашной — оружие ближнего боя и броня до 20§; для Наемника — дальнее оружие и броня до 20§. Стоимость оплачивается отдельно от 10§.</p>';
 for(let i=0;i<6;i++)html+=label(`Бесплатный предмет ${i+1}`,`<select name="starter">${options(equipmentOptions,saved.starter?.[i])}</select>`);
 html+='<h3>Начальный гримуар</h3><p>Только для Дабблера и Расхитителя могил: две разные Магии (одна Колдовства / Некромантии соответственно, вторая — другой школы) и три разных Иммуто. Бесплатное снаряжение выше оставьте пустым. Другим Стремлениям этот раздел заполнять не нужно.</p>';
 for(const [kind,count,title] of [['magia',2,'Магия'],['immuto',3,'Иммуто']])for(let i=0;i<count;i++)html+=label(`${title} ${i+1}`,`<select name="${kind}">${options([['','Не выбирать'],...magic.filter(d=>catalogMeta(d).kind===kind).map(d=>[d.uuid,`${d.name}${kind==='magia'?' · '+SKILLS[d.system.skill].label:''}`])],saved[kind]?.[i])}</select>`);
 html+='<p>Конструкт Жестянщика и альтернативный пневматический старт Ударника пока оформляет мастер отдельно. Стандартный набор Ударника доступен выше.</p>';
 html+=label('Сложное стартовое имущество будет оформлено отдельно',`<input type="checkbox" name="manualStarterConfirmed" ${saved.manualStarterConfirmed?'checked':''}>`);
 html+='<h3>Покупки на начальные 10§</h3><p>Пустые строки пропускаются. Несколько экземпляров покупаются выбором в нескольких строках. Новое начальное стрелковое оружие получает запас на пять перезарядок, минимум 10 патронов.</p>';
 for(let i=0;i<6;i++)html+=label(`Покупка ${i+1}`,`<select name="bought">${options(equipmentOptions,saved.bought?.[i])}</select>`);
 html+='<h3>Масти Смешанной колоды</h3>';
 ['Определяющая','Предков','Центральная','Наследия'].forEach((name,i)=>{html+=label(name,`<select name="twist">${options(Object.entries(SUITS),saved.twist?.[i]??Object.keys(SUITS)[i])}</select>`);});
 html+=label('Концепция, языки и примечания',`<textarea name="notes">${e(saved.notes)}</textarea>`);
 html+='<section data-weapon-preview aria-live="polite"></section>';
 const f=await dialog('Создание персонажа по Таро',html,'Завершить создание',true,element=>{
   const form=element.querySelector('form'),preview=element.querySelector('[data-weapon-preview]');
   const update=()=>{const data=new FormData(form);preview.innerHTML='<h3>Выбранное оружие</h3>'+['starter','bought'].flatMap(k=>data.getAll(k)).map(uuid=>equipment.find(i=>i.uuid===uuid)).filter(i=>i?.system.isWeapon).map(i=>`<p>${e(i.name)} · ${e(draftWeaponRating(data,rows,i).label)}</p>`).join('')+'<p>Предварительный рейтинг по текущему распределению навыков и аспектов. Условные бонусы талантов учитывайте отдельно. Необученное оружие использовать можно.</p>';};
   form.addEventListener('change',update);update();
 });if(!f)return;
 const form=Object.fromEntries(f.entries());for(const k of ['body','mind','root','endeavor','mods','starter','bought','twist','magia','immuto'])form[k]=f.getAll(k);for(const k of ['starter','bought','magia','immuto'])form[k]=form[k].filter(Boolean);form.requirementsConfirmed=f.has('requirementsConfirmed');form.manualStarterConfirmed=f.has('manualStarterConfirmed');
 await request({op:'creationSave',actorUuid:actor.uuid,form});
 if(f.get('creationAction')==='complete'){await request({op:'creationApply',actorUuid:actor.uuid,form});ui.notifications.info('Персонаж создан; личная колода готова. Триггеры навыков ранга 3 выберите отдельно по книге.');}
 else ui.notifications.info('Черновик сохранён. Вы можете продолжить создание позже.');
}
export async function browseCatalog(actor){
 assert(actor.isOwner,'Нет прав на лист.');
 const f=await dialog('Добавить из библиотеки',label('Раздел',`<select name="pack">${options([['equipment','Снаряжение'],['pursuits','Стремления'],['talents','Таланты'],['magic','Магии и Иммуто'],['stations','Станции'],['skills','Навыки (справочник)']],'equipment')}</select>`));if(!f)return;
 const name=f.get('pack'),docs=await catalogDocuments(name);
 const rating=i=>i.system.isWeapon?' · '+weaponRating(actor,i).label:'';
 const selected=await dialog('Запись библиотеки',label('Запись',`<select name="uuid">${options(docs.map(i=>[i.uuid,`${i.name}${rating(i)}${i.type==='equipment'?' · '+i.system.price+'§':''}`]))}</select>`)+label('Количество','<input name="quantity" type="number" min="1" max="99" value="1">')+(game.user.isGM?label('Добавить бесплатно (выдача мастером)','<input name="free" type="checkbox">'):'')+'<p>Купить можно только снаряжение. Таланты, Станции и Стремления добавляет мастер после проверки правил. Справочник навыков не выдаёт ранги.</p>','Добавить');if(!selected)return;
 await request({op:selected.has('free')?'catalogImport':'catalogBuy',actorUuid:actor.uuid,uuid:selected.get('uuid'),quantity:Number(selected.get('quantity'))});
}
export async function beginSession(){
 assert(game.user.isGM,'Пролог проводит мастер.');const actors=game.actors.filter(a=>a.type==='fated'&&stack('hand',a.id));assert(actors.length,'Сначала создайте личные колоды.');
 const f=await dialog('Конец пролога',label('Уникальное название сессии','<input name="session" required maxlength="120">')+'<p>Повтор с тем же названием не выдаёт карты повторно. Выберите участников этой сессии.</p>'+actors.map(a=>label(a.name,`<input type="checkbox" name="actorIds" value="${e(a.id)}" checked>`)).join(''),'Раздать по три карты');if(f)await request({op:'sessionStart',session:f.get('session'),actorIds:f.getAll('actorIds')});
}
export async function endScene(){assert(game.user.isGM,'Сцену завершает мастер.');const f=await dialog('Окончание сцены','<p>Завершить состояния сцены и предложить игрокам обновление рук до трёх карт?</p>','Завершить сцену');if(f)await request({op:'endDrama'});}
export async function endSession(){
 assert(game.user.isGM,'Эпилог проводит мастер.');const sessions=game.settings.get(ID,'sessions');const f=await dialog('Эпилог',label('Сессия',`<select name="session">${options(Object.keys(sessions).map(k=>[k,k]))}</select>`));if(!f)return;const session=f.get('session');assert(sessions[session],'Сначала проведите пролог с названием сессии.');
 for(const [id,status] of Object.entries(sessions[session].actors)){
  const actor=game.actors.get(id);if(!actor||status!=='done'||actor.system.epilogues.some(x=>x.id===session))continue;
  const choice=await dialog(`Эпилог: ${actor.name}`,label('Первый разрешённый навык',`<select name="first" required>${skillOptions()}</select>`)+label('Второй разрешённый навык',`<select name="second" required>${skillOptions()}</select>`)+label('Стремление',`<select name="pursuit">${options([['','Без отдельной записи'],...actor.items.filter(i=>i.system.category==='pursuit').map(i=>[i.id,i.name])],actor.system.currentPursuitId)}</select>`)+`<p>1 опыт и шаг Стремления; один навык затем повышается в разделе «Развитие». Талант за шаг игрок выбирает в разделе «Развитие». Уже обработанные участники пропускаются.</p>`,'Выдать развитие');if(!choice)return;
  await request({op:'epilogue',actorUuid:actor.uuid,session,eligible:[choice.get('first'),choice.get('second')],pursuitId:choice.get('pursuit')});
 }
 ui.notifications.info('Эпилог проведён. Игроки могут выбрать повышение навыка в листах.');
}
