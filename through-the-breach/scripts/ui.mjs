import {availableTriggers} from './automation.mjs';
import {createCharacter,browseCatalog} from './creation-ui.mjs';
import {ID,SUITS,SYMBOLS,ASPECTS,SKILLS,GROUPS,TWIST_ROLES,derived,skillValue,aspectValue,canCheat,escapeHTML as e} from "./rules.mjs";
import {stack,request,authority} from "./cards.mjs";
import {EFFECT_LABELS} from './turns.mjs';
const {HandlebarsApplicationMixin,ApplicationV2,DialogV2}=foundry.applications.api;
const choices=(values,selected)=>Object.entries(values).map(([k,v])=>`<option value="${e(k)}" ${k===selected?"selected":""}>${e(v)}</option>`).join("");
function targets(actor){
  const all=[...Array.from(game.user.targets??[]).map(t=>t.actor),...game.actors.filter(a=>game.user.isGM||a.visible)];
  return [...new Map(all.filter(a=>a&&a.uuid!==actor.uuid).map(a=>[a.uuid,a])).values()];
}
const targetChoices=actor=>targets(actor).map(a=>`<option value="${e(a.uuid)}">${e(a.name)}${a.isToken?' (токен сцены)':''}</option>`).join('');
async function formDialog(title,content,label="Продолжить"){
  return DialogV2.prompt({window:{title},content:`<div class="ttb-dialog">${content}</div>`,ok:{label,callback:(_event,button)=>{const data=new FormData(button.form),result=Object.fromEntries(data.entries());if(button.form.querySelector('[name="immutoIds"]'))result.immutoIds=data.getAll('immutoIds');const counts=[...button.form.querySelectorAll('[data-immuto-count]')];if(counts.length)result.immutoIds=counts.flatMap(el=>Array.from({length:Math.max(0,Math.min(99,Number(el.value)||0))},()=>el.dataset.immutoCount));return result;}},rejectClose:false});
}
export async function safely(fn){try{return await fn();}catch(err){console.error(ID,err);ui.notifications.error(err.message);}}
export async function checkDialog(actor,skill,kind="duel"){
  const known=SKILLS[skill];
  const title=kind==="damage"?"Флип урона":known?.label??ASPECTS[skill]??(skill==="defense"?"Защита":"Сила воли");
  const content=`<p>${e(actor.name)} · ${e(title)}</p>${known?`<label>Аспект<select name="aspect">${choices(ASPECTS,actor.system.skills[skill].aspect)}</select></label>`:""}${kind!=="damage"?`<label>Сложность (СЛ)<input type="number" name="tn" value="10" min="0" max="99"></label><label>Требуемые масти<input name="required" placeholder="Например: T, RR или RM"></label>`:`<label>Урон: слабый / умеренный / тяжёлый<input name="track" value="1/2/3" pattern="[0-9]+/[0-9]+/[0-9]+" required></label><p>Модификатор точности: разница 0 → −−; 1–5 → −; 6–10 → 0; 11+ → +. Учтите его ниже.</p>`}<div class="ttb-dialog-grid"><label>Положительных (+)<input name="positive" type="number" min="0" max="99" value="0"></label><label>Отрицательных (−)<input name="negative" type="number" min="0" max="99" value="0"></label></div>${kind!=="damage"?`<label>Числовая поправка<input name="bonus" type="number" min="-100" max="100" value="0"></label>`:""}${kind==="duel"?'<label><input type="checkbox" name="sight">Проверка требует зрения (Слепота: −−)</label><label><input type="checkbox" name="useFocus">Использовать Сосредоточенность для этого действия</label>':''}${actor.type==="npc"&&kind==="duel"?"<p>Для проверки ПМ против ПМ каждый +/− меняет сумму на 2. Против Сужденного используйте проверку в листе игрока, развернув модификаторы ПМ.</p>":""}`;
  const form=await formDialog(title,content,"Перевернуть карту");if(!form)return;
  if(kind==='damage'){
    const f=await formDialog('Цель урона',`<label>Цель<select name="targetUuid"><option value="">Без применения к цели</option>${targetChoices(actor)}</select></label>`);if(!f)return;form.targetUuid=f.targetUuid||null;
  }
  return request({op:"duel",actorId:actor.id,actorUuid:actor.uuid,kind,skill,action:kind==='duel'&&!['defense','willpower'].includes(skill),...form,positive:Number(form.positive),negative:Number(form.negative),track:kind==="damage"?form.track.split("/").map(Number):[1,2,3]});
}
export async function handleChat(message,op,element){
  const d=message.getFlag(ID,"duel"),actor=d.actorUuid?fromUuidSync(d.actorUuid):game.actors.get(d.actorId);
  if(op==='declareTrigger'){
    const options=Object.fromEntries(availableTriggers(actor.system,d).map(t=>[t.id,`${t.name} (${t.suits})`]));
    const f=await formDialog('Объявить один триггер',`<label>Изученный триггер<select name="triggerId">${choices(options,'')}</select></label><label><input type="checkbox" name="confirmed" required>Условия применения по книге выполнены; эффект разрешит мастер</label>`);
    if(f)return request({op,actorUuid:actor.uuid,messageId:message.id,triggerId:f.triggerId,confirmed:f.confirmed==='on'});return;
  }
  if(op==="pick")return request({op,messageId:message.id,index:Number(element.dataset.index)});
  if(op==="finish")return request({op,messageId:message.id});
  if(['undoDamage','consciousness'].includes(op))return request({op,messageId:message.id});
  if(op==='criticalConsciousness'){
    const target=fromUuidSync(d.targetUuid),effect=d.criticalConsciousness;if(!target||!effect)return;
    const tn=effect.baseTN+Math.max(0,-target.system.wounds.value);
    const f=await formDialog('Сознание от критической раны',`<p>${e(target.name)} · Жесткость · СЛ ${tn} (${effect.baseTN} + отрицательные ранения). Для ПМ используется ранг вместо карты.</p>${effect.repeat?'<p>Начинайте проверку только при действии, указанном для поражённого места. Снятие травмы контролирует мастер.</p>':''}${effect.livingOnly?'<label><input type="checkbox" name="living" required>Цель живая и не погибла от поражения головы или груди</label>':''}<label>Дополнительных +<input name="positive" type="number" value="0" min="0" max="99"></label><label>Дополнительных −<input name="negative" type="number" value="0" min="0" max="99"></label>`,'Начать проверку');
    if(f)return request({op,messageId:message.id,living:f.living==='on',positive:Number(f.positive),negative:Number(f.negative)});
  }
  if(op==='applyDamage'){
    const f=await formDialog('Применить урон',`<p>Цель: ${e(fromUuidSync(d.targetUuid)?.name??'не найдена')}. Броня учитывается автоматически.</p><label><input type="checkbox" name="ignoreArmor">Игнорировать броню</label>`,'Применить');
    if(f)return request({op,messageId:message.id,ignoreArmor:f.ignoreArmor==='on'});
  }
  if(op==='critical'){
    const f=await formDialog('Критический эффект','<p>Карта вытягивается без модификаторов и Обмана судьбы. Отрицательные ранения учитываются автоматически.</p><label>Дополнительная поправка к таблице (например, Глубокая рана +2)<input name="bonus" type="number" value="0" min="-99" max="99"></label>','Определить');
    if(f)return request({op,messageId:message.id,bonus:Number(f.bonus)});
  }
  if(op==='attackDamage'){
    const f=await formDialog('Урон атаки','<p>Урон оружия и модификатор точности берутся из завершённой атаки. Ниже укажите только дополнительные модификаторы.</p><label>Дополнительных +<input name="positive" type="number" value="0" min="0" max="99"></label><label>Дополнительных −<input name="negative" type="number" value="0" min="0" max="99"></label>','Перевернуть');
    if(f)return request({op,messageId:message.id,positive:Number(f.positive),negative:Number(f.negative)});
  }
  if(op==="red"){
    const f=await formDialog("Масть красного джокера",`<label>Масть<select name="suit">${choices(SUITS,d.redSuit)}</select></label>`);
    if(f)return request({op,messageId:message.id,suit:f.suit});
  }
  if(op==="cheat"){
    const hand=stack("hand",actor.id);if(!hand?.cards.size)return ui.notifications.warn("В руке нет карт для Обмана судьбы.");
    const f=await formDialog("Обман судьбы",`<p>Заменить карту можно один раз. Выбранная карта покинет вашу руку.</p><label>Карта<select name="cardId">${hand.cards.map(c=>`<option value="${c.id}">${e(c.name)}</option>`).join("")}</select></label>`);
    if(f)return request({op,messageId:message.id,cardId:f.cardId});
  }
}
export class BreachSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2){
  static DEFAULT_OPTIONS={classes:["ttb","ttb-sheet"],position:{width:880,height:820},window:{resizable:true},form:{submitOnChange:true},actions:{creation:BreachSheet.creation,catalog:BreachSheet.catalog,sheetTab:BreachSheet.tab,check:BreachSheet.check,hand:BreachSheet.hand,table:BreachSheet.table,item:BreachSheet.item,createWeapon:BreachSheet.createWeapon,attack:BreachSheet.attack,tieOrder:BreachSheet.tieOrder,turnAction:BreachSheet.turnAction,automation:BreachSheet.automation,createRecord:BreachSheet.createRecord}};
  static PARTS={body:{template:`systems/${ID}/templates/actor.hbs`,scrollable:[".ttb-body"]}};
  static creation(){return safely(()=>createCharacter(this.actor));}
  static catalog(){return safely(()=>browseCatalog(this.actor));}
  _tab="main";
  get title(){return `${this.actor.name} · ${this.actor.type==="npc"?"Персонаж мастера":"Сужденный"}`;}
  async _prepareContext(options){
    const context=await super._prepareContext(options),s=this.actor.system,c=derived(s),hand=stack("hand",this.actor.id);
    const canViewHand=this.actor.isOwner && hand?.testUserPermission(game.user,"OBSERVER");
    return {...context,systemVersion:game.system.version,actor:this.actor,s,c,isGM:game.user.isGM,isNPC:this.actor.type==="npc",editable:this.isEditable,
      effects:s.effects.map(x=>({...x,label:EFFECT_LABELS[x.kind]??x.kind,timed:!!x.ends})),
      turnPending:!!game.combat?.getFlag(ID,'turnPending'),
      tabs:[['main','Персонаж'],['skills','Навыки'],['fate','Судьба'],['story','История'],['records','Снаряжение и магия'],['development','Развитие']].map(([id,label])=>({id,label,active:this._tab===id})),
      pursuitOptions:{'':'Без отдельной записи',...Object.fromEntries(this.actor.items.filter(i=>i.type==='talent'&&i.system.category==='pursuit').map(i=>[i.id,i.name]))},
      recordsTab:this._tab==='records',developmentTab:this._tab==='development',
      records:this.actor.items.map(i=>({id:i.id,name:i.name,type:i.type,...i.system.toObject(),isMagic:i.type==='magic'&&['spell','magia'].includes(i.system.magicKind),isGrimoire:i.type==='magic'&&i.system.magicKind==='grimoire',isEquipment:i.type==='equipment',step:s.pursuitProgress.find(x=>x.id===i.id)?.step??0})),
      pursuitRows:s.pursuitProgress.map(x=>({name:this.actor.items.get(x.id)?.name??x.id,step:x.step,maximum:this.actor.items.get(x.id)?.system.stepMax})),
      epilogues:s.epilogues.map(x=>({...x,eligibleNames:x.eligible.map(k=>SKILLS[k]?.label).join(', '),chosenName:SKILLS[x.chosen]?.label})),triggers:s.learnedTriggers.map(x=>({...x,skillName:SKILLS[x.skill]?.label})),
      main:this._tab==="main",skillsTab:this._tab==="skills",fateTab:this._tab==="fate",storyTab:this._tab==="story",
      aspects:Object.entries(ASPECTS).map(([key,label])=>({key,label,value:s.aspects[key],temporary:s.temporaryAspects[key],total:aspectValue(s,key)})),aspectOptions:ASPECTS,suitOptions:SUITS,
      skillGroups:Object.entries(GROUPS).map(([id,label])=>({label,skills:Object.values(SKILLS).filter(k=>k.group===id).map(k=>({...k,...s.skills[k.id],av:skillValue(s,k.id)}))})),
      stats:[['defense','Защита'],['willpower','Сила воли'],['wounds','Макс. ранений'],['initiative','Инициатива'],['walk','Ходьба'],['charge','Рывок']].map(([id,label])=>({id,label,value:c[id],bonus:s.bonuses[id]})),
      twistRoles:TWIST_ROLES.map((label,i)=>({label,index:i,suit:s.twist[i]})),hasDeck:!!stack("twist",this.actor.id),
      handCards:canViewHand?hand.cards.map(card=>({id:card.id,name:card.name,img:card.faces[0]?.img})):[],
      handCount:canViewHand?hand.cards.size:0,overflow:canViewHand&&hand.cards.size>5,credits:canViewHand?(hand.getFlag(ID,"credits")??0):0,refresh:canViewHand&&hand.getFlag(ID,"refresh"),
      masterOnline:!!authority(),npcDefense:c.defense+s.rank,npcWillpower:c.willpower+s.rank,
      items:this.actor.items.map(item=>({id:item.id,name:item.name,description:item.system.description,quantity:item.system.quantity})),
      weapons:this.actor.items.filter(item=>item.system.isWeapon).map(item=>({id:item.id,name:item.name,range:item.system.range,damage:item.system.damage,skill:SKILLS[item.system.skill]?.label})),
      openChecks:game.messages.filter(m=>m.author?.isGM&&m.getFlag(ID,"duel")?.actorId===this.actor.id&&!m.getFlag(ID,"duel").closed).map(m=>({id:m.id,label:m.getFlag(ID,"duel").label}))
    };
  }
  _processFormData(event,form,formData){
    const result=super._processFormData(event,form,formData);
    if(result.system?.twist)result.system.twist=Object.values(result.system.twist);
    return result;
  }
  async _onRender(context,options){await super._onRender(context,options);this.element.querySelectorAll('[data-hand-card]').forEach(el=>el.addEventListener("change",event=>event.stopPropagation()));}
  static tab(_event,target){this._tab=target.dataset.tab;this.render();}
  static turnAction(_event,target){return safely(async()=>{
    const op=target.dataset.op;
    if(op==='recoverTurn'){
      const f=await formDialog('Подтвердить последствия хода','<p>Сверьте ОД, кровотечение и состояния участников с чатом. Исправьте поля вручную. Подтверждение снимает блокировку и помечает прерванный шаг обработанным; повторно он не выполняется.</p>','Последствия проверены');
      if(!f)return;
    }
    if(op==='addEffect'){
      const f=await formDialog('Добавить состояние',`<label>Состояние<select name="kind">${choices(EFFECT_LABELS,'slow')}</select></label><label>Значение (для числовых состояний)<input name="value" type="number" min="1" max="99" value="1"></label><label><input type="checkbox" name="temporary">Явно продлить до конца следующего хода</label><p>По умолчанию Быстрота, Замедление, Паралич и Сосредоточенность заканчиваются в конце текущего или ближайшего хода; Оборона — в начале следующего.</p>`,'Добавить');
      if(f)return request({op,actorUuid:this.actor.uuid,kind:f.kind,value:Number(f.value),temporary:f.temporary==='on'});return;
    }
    return request({op,actorUuid:this.actor.uuid,cost:Number(target.dataset.cost??0),effectId:target.dataset.effectId});
  });}
  static table(){new FateTable().render({force:true});}
  static createRecord(_event,target){return safely(async()=>{if(!this.isEditable)return;const type=target.dataset.type??'equipment',category=target.dataset.category??'',magicKind=target.dataset.magicKind??'spell';const [item]=await this.actor.createEmbeddedDocuments('Item',[{name:category==='pursuit'?'Новое Стремление':type==='magic'?'Новая магическая запись':type==='talent'?'Новый талант':'Новый предмет',type,system:{category,magicKind,skill:type==='magic'?'sorcery':'melee'}}]);item.sheet.render({force:true});});}
  static automation(_event,target){return safely(async()=>{
    if(!this.isEditable)return;const op=target.dataset.op,item=this.actor.items.get(target.dataset.itemId);let f;
    const skills=Object.fromEntries(Object.values(SKILLS).map(k=>[k.id,k.label]));
    if(op==='reload')f=await formDialog('Перезарядка',`<p>${e(item.name)}: ${item.system.loaded}/${item.system.capacity}, запас ${item.system.reserve}. Оплачено ${item.system.reloadProgress}/${item.system.reloadCost} ОД. Вне боя перезаряжается полностью без расхода ОД.</p><label>Оплатить ОД<input name="cost" type="number" value="1" min="1" max="99"></label>`);
    else if(op==='heal')f=await formDialog('Исцеление','<p>Укажите итог уже разрешённого исцеления. Максимум ранений учитывается; при результате от 1 ранения персонаж приходит в сознание. Сбит с ног и травмы сохраняются.</p><label>Восстановить ранений<input type="number" name="amount" value="1" min="1" max="999"></label>');
    else if(op==='epilogue')f=await formDialog('Открыть эпилог',`<label>Уникальное название сессии<input name="session" required></label><label>Первый навык<select name="first">${choices(skills,'notice')}</select></label><label>Второй навык<select name="second">${choices(skills,'evade')}</select></label><label>Продвигаемое Стремление<select name="pursuitId"><option value="">Без записи Стремления (шаг отметить вручную)</option>${this.actor.items.filter(i=>i.type==='talent'&&i.system.category==='pursuit').map(i=>`<option value="${e(i.id)}">${e(i.name)}</option>`).join('')}</select></label><p>Выдаётся 1 опыт и 1 шаг выбранного Стремления. Талант за шаг выберите и добавьте отдельно по его таблице; для продвинутого Стремления мастер проверяет требования.</p>`);
    else if(op==='advanceSkill'){const ep=this.actor.system.epilogues.find(x=>x.id===target.dataset.epilogueId);f=await formDialog('Повысить один навык',`<p>За этот эпилог можно повысить один навык. 0 → 1 бесплатно; иначе цена — текущий ранг. Максимум 5.</p><label>Навык<select name="skill">${choices(Object.fromEntries(ep.eligible.map(k=>[k,`${SKILLS[k].label}: ранг ${this.actor.system.skills[k].rank}, цена ${this.actor.system.skills[k].rank}`])),ep.eligible[0])}</select></label>`);}
    else if(op==='learnTrigger')f=await formDialog('Изучить триггер',`<p>Цена: 1 опыт. Одно место при ранге 3, два при ранге 5. Изученные при создании триггеры заносит мастер по правилам создания.</p>${game.user.isGM?'<label><input type="checkbox" name="creation">Бесплатный триггер при создании персонажа (один за навык)</label>':''}<label>Навык<select name="skill">${choices(skills,'pistol')}</select></label><label>Название<input name="name" required></label><label>Масти<input name="suits" placeholder="R, TT, RM"></label><label>Эффект и условия<textarea name="description"></textarea></label>`);
    else if(op==='castSpell')f=await formDialog(`Магия: ${item.name}`,`<p>СЛ ${item.system.tn} ${e(item.system.required)}, ${item.system.apCost} ОД; ${e(item.system.range)}; длительность ${e(item.system.duration)}.</p><label>Цель<select name="targetUuid"><option value="">Без цели</option>${targetChoices(this.actor)}</select></label><p>Иммуто: укажите число применений (0 — не использовать).</p>${this.actor.items.filter(i=>i.type==='magic'&&i.system.magicKind==='immuto').map(i=>`<label>${e(i.name)}: СЛ ${i.system.tnAdjustment>=0?'+':''}${i.system.tnAdjustment}, ОД ${i.system.apAdjustment}<input data-immuto-count="${e(i.id)}" name="immutoCount-${e(i.id)}" type="number" min="0" max="${i.system.maxCopies}" value="0"></label>`).join('')}<label>Дополнительных +<input name="positive" type="number" min="0" value="0"></label><label>Дополнительных −<input name="negative" type="number" min="0" value="0"></label><label>Числовая поправка к дуэли<input name="bonus" type="number" value="0"></label>${game.user.isGM?'<div class="ttb-dialog-grid"><label>Сопротивление Сужденного: +<input name="defPositive" type="number" min="0" value="0"></label><label>Сопротивление Сужденного: −<input name="defNegative" type="number" min="0" value="0"></label></div>':''}<label><input type="checkbox" name="earth">На Земле (дополнительный −)</label><label><input type="checkbox" name="willing">Цель добровольно принимает эффект</label><label><input type="checkbox" name="confirmed" required>Требования Магии, Иммуто и магической теории проверены; их особые эффекты применяет мастер</label><p>Парную дуэль против сопротивляющегося Сужденного запускает мастер. Комбинации дороже 2 ОД пока разрешаются вручную.</p>`);
    else if(op==='attune')f=await formDialog('Настройка на Гримуар','<p>Мастер подтверждает завершённую настройку. Для заклинаний будет доступен один выбранный Гримуар. Поддержание памяти и исключения талантов пока контролируются вручную.</p>');
    else if(op==='recoverOperation')f=await formDialog('Снять блокировку операции','<p>Сверьте ОД, патроны, записи и последние действия. Исправьте последствия вручную. Эта кнопка только снимает блокировку и не повторяет действие.</p>');
    else if(op==='buyItem')f=await formDialog('Купить предмет',`<p>Купить одну единицу «${e(item.name)}» за ${item.system.price} скрипов? Проверьте цену и наличие у продавца.</p>`);
    else if(op==='useItem')f=await formDialog('Использовать предмет',`<p>Количество «${e(item.name)}» уменьшится на 1. Особые эффекты и ОД применения разрешите отдельно.</p>`);
    else throw Error('Неизвестная кнопка.');
    if(!f)return;
    // FormData needs getAll for a multiple select: formDialog preserves its array below.
    return request({op,actorUuid:this.actor.uuid,itemId:item?.id,epilogueId:target.dataset.epilogueId,...f,eligible:op==='epilogue'?[f.first,f.second]:undefined,immutoIds:f.immutoIds??[],creation:f.creation==='on',confirmed:f.confirmed==='on',earth:f.earth==='on',willing:f.willing==='on'});
  });}
  static item(_event,target){this.actor.items.get(target.dataset.itemId)?.sheet.render({force:true});}
  static createWeapon(){return safely(async()=>{if(!this.isEditable)return;const [item]=await this.actor.createEmbeddedDocuments('Item',[{name:'Новое оружие',type:'equipment',system:{isWeapon:true}}]);item.sheet.render({force:true});});}
  static attack(_event,target){return safely(async()=>{
    if(!this.isEditable)return;
    const item=this.actor.items.get(target.dataset.itemId);
    const defenseModifiers=game.user.isGM?'<p>Для цели-Сужденного: модификаторы её защиты (для ПМ не используются).</p><label>Защита: +<input name="defPositive" type="number" value="0" min="0" max="99"></label><label>Защита: −<input name="defNegative" type="number" value="0" min="0" max="99"></label>':'';
    const f=await formDialog(`Атака: ${item.name}`,`<p>Дальность: ${e(item.system.range)}. Расстояние, укрытие и особые свойства проверяет мастер. Патроны списываются автоматически при включённом учёте боезапаса.</p><label>Цель<select name="targetUuid" required>${targetChoices(this.actor)}</select></label><label>Положительных +<input name="positive" type="number" value="0" min="0" max="99"></label><label>Отрицательных −<input name="negative" type="number" value="0" min="0" max="99"></label><label>Числовая поправка к атаке<input name="bonus" type="number" value="0"></label><label><input name="useFocus" type="checkbox">Использовать Сосредоточенность</label>${defenseModifiers}`,'Атаковать');
    if(f)return request({op:'attack',actorUuid:this.actor.uuid,itemId:item.id,...f});
  });}
  static tieOrder(){return safely(async()=>{
    if(!game.user.isGM)return;
    const c=game.combat?.combatants.find(c=>c.actor?.uuid===this.actor.uuid);
    if(!c)return ui.notifications.warn('Сначала добавьте персонажа в активное сражение.');
    const f=await formDialog('Порядок при ничьей','<p>При равной инициативе сначала ходит Сужденный, затем персонаж с большей Скоростью. При полном равенстве меньшее число идёт раньше. Меняйте порядок по договорённости в каждом раунде.</p><label>Порядок<input name="order" type="number" value="0" min="0"></label>','Сохранить');
    if(f)await c.setFlag(ID,'tieOrder',Number(f.order));
  });}
  static check(_event,target){return safely(async()=>{
    if(!this.isEditable)return;
    const kind=target.dataset.kind??"duel";
    if(kind==="initiative"){const c=game.combat?.combatants.find(c=>c.actor?.uuid===this.actor.uuid);return request({op:"duel",actorId:this.actor.id,actorUuid:this.actor.uuid,kind,combatId:c?.parent.id,combatantId:c?.id});}
    return checkDialog(this.actor,target.dataset.skill,kind);
  });}
  static hand(_event,target){return safely(async()=>{
    if(!this.isEditable)return;
    const op=target.dataset.op,ids=Array.from(this.element.querySelectorAll('[data-hand-card]:checked')).map(el=>el.dataset.handCard);
    await request({op,actorId:this.actor.id,ids});
    this.render();
  });}
}
export class BreachItemSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ItemSheetV2){
  static DEFAULT_OPTIONS={classes:["ttb"],position:{width:600,height:740},window:{resizable:true},form:{submitOnChange:true}};
  static PARTS={body:{template:`systems/${ID}/templates/item.hbs`}};
  async _prepareContext(options){return {...await super._prepareContext(options),item:this.document,s:this.document.system,pursuitOption:{pursuit:'Стремление'},grimoireOptions:{'':'Вне Гримуара (талант / проявленная сила)',...Object.fromEntries((this.document.parent?.items??[]).filter(i=>i.type==='magic'&&i.system.magicKind==='grimoire').map(i=>[i.id,i.name]))},isMagic:this.document.type==='magic',isTalent:this.document.type==='talent',isEquipment:this.document.type==='equipment',aspectOptions:ASPECTS,magicOptions:{spell:'Подготовленное заклинание',magia:'Магия',immuto:'Иммуто',grimoire:'Гримуар'},bonusOptions:{'':'Нет',...Object.fromEntries(Object.entries(ASPECTS).map(([k,v])=>[`aspect.${k}`,`Аспект: ${v}`])),...Object.fromEntries(Object.values(SKILLS).map(k=>[`skill.${k.id}`,`Навык: ${k.label}`])),defense:'Защита',willpower:'Сила воли',wounds:'Макс. ранений',initiative:'Инициатива',walk:'Ходьба',charge:'Рывок',armor:'Броня'},skillOptions:Object.fromEntries(Object.values(SKILLS).map(k=>[k.id,k.label])),defenseOptions:{defense:'Защита',willpower:'Сила воли'},resistanceOptions:{'':'Нет',defense:'Защита',willpower:'Сила воли'},slotOptions:{'':'Нет',arms:'Руки',legs:'Ноги',head:'Голова',chest:'Грудь'},armorOptions:{'':'Нет',light:'Лёгкая',heavy:'Тяжёлая'}};}
}
export class FateTable extends HandlebarsApplicationMixin(ApplicationV2){
  static DEFAULT_OPTIONS={id:"ttb-fate-table",classes:["ttb","ttb-table"],window:{title:"Стол Судьбы",resizable:true},position:{width:740,height:680},actions:{manage:FateTable.manage,actor:FateTable.actor}};
  static PARTS={body:{template:`systems/${ID}/templates/table.hbs`,scrollable:[".ttb-body"]}};
  async _prepareContext(){return {
    isGM:game.user.isGM,masterOnline:!!authority(),ready:!!stack("fate"),remaining:game.user.isGM?stack("fate")?.availableCards.length:undefined,
    discarded:game.user.isGM?stack("discard")?.cards.size:undefined,active:game.user.isGM?stack("active")?.cards.size:undefined,
    characters:game.actors.filter(a=>a.type==="fated"&&a.isOwner).map(a=>{const hand=stack("hand",a.id);return {id:a.id,name:a.name,ready:!!hand,count:hand?.cards.size??0,isGM:game.user.isGM};}),
    openChecks:game.user.isGM?game.messages.filter(m=>m.author?.isGM&&m.getFlag(ID,"duel")&&!m.getFlag(ID,"duel").closed).map(m=>({id:m.id,label:`${m.getFlag(ID,"duel").actorName} · ${m.getFlag(ID,"duel").label}`})):[]
  };}
  static actor(_event,target){game.actors.get(target.dataset.actorId)?.sheet.render({force:true});}
  static manage(_event,target){return safely(async()=>{
    const op=target.dataset.op;
    const prompts={shuffle:"Перетасовать общую колоду вместе со сбросом и разрешить каждому игроку взять одну Смешанную карту?",prologue:"Раздать ещё по три карты всем подготовленным Сужденным? Нажимайте один раз в конце пролога.",endDrama:"Разрешить всем Сужденным сбросить выбранные карты и добрать до трёх?",recover:"Отменить эту незавершённую проверку и отправить её удерживаемые карты в сброс?"};
    if(prompts[op]&&!await DialogV2.confirm({window:{title:"Стол Судьбы"},content:`<p>${prompts[op]}</p>`,yes:{label:"Продолжить"},no:{label:"Отмена"}}))return;
    await request({op,actorId:target.dataset.actorId,messageId:target.dataset.messageId});this.render();
  });}
}
