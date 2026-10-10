import {cardImage} from './localization.mjs';
import {documentName,localizedField} from './localization.mjs';
import {localizedEditableFields,preserveTranslatedFields} from './localization-ui.mjs';
import {t as ttbT,tr as ttbTr} from './localization.mjs';
import {availableTriggers,spellPlan} from './automation.mjs';
import {SpellBuilder} from './spell-ui.mjs';
import {SKILL_HELP} from './skill-help.mjs';
import {itemArtwork} from './item-art.mjs';
import {removeRecord} from './item-management.mjs';
import {createCharacter,browseCatalog} from './creation-ui.mjs';
import {cardName,statRank,ID,SUITS,SYMBOLS,ASPECTS,SKILLS,GROUPS,TWIST_ROLES,derived,skillValue,aspectValue,canCheat,escapeHTML as e} from "./rules.mjs";
import {stack,request,authority} from "./cards.mjs";
import {EFFECT_LABELS} from './turns.mjs';
import {weaponRating} from './battle.mjs';
import {rewardChoices} from './pursuits.mjs';
import {catalogDocuments,catalogMeta,tarotTables} from './creation.mjs';
const {HandlebarsApplicationMixin,ApplicationV2,DialogV2}=foundry.applications.api;
const choices=(values,selected)=>Object.entries(values).map(([k,v])=>`<option value="${e(k)}" ${k===selected?"selected":""}>${e(v)}</option>`).join("");
function targets(actor){
  const all=[...Array.from(game.user.targets??[]).map(t=>t.actor),...game.actors.filter(a=>game.user.isGM||a.visible)];
  return [...new Map(all.filter(a=>a&&a.uuid!==actor.uuid).map(a=>[a.uuid,a])).values()];
}
const targetChoices=actor=>targets(actor).map(a=>`<option value="${e(a.uuid)}">${e(a.name)}${a.isToken?ttbT(' (токен сцены)'):''}</option>`).join('');
const targetHint=ttbT('<p class="ttb-help">Не видите противника? Выберите его токен целью на сцене средствами Foundry, затем откройте это окно снова. Скрытые токены игроку недоступны; мастер может выбрать цель сам.</p>');
async function formDialog(title,content,label=ttbT("Продолжить")){
  return DialogV2.prompt({window:{title},content:`<div class="ttb-dialog">${content}</div>`,ok:{label,callback:(_event,button)=>{const data=new FormData(button.form),result=Object.fromEntries(data.entries());if(button.form.querySelector('[name="immutoIds"]'))result.immutoIds=data.getAll('immutoIds');for(const name of ['skills','actorUuids'])if(button.form.querySelector(`[name="${name}"]`))result[name]=data.getAll(name);const counts=[...button.form.querySelectorAll('[data-immuto-count]')];if(counts.length)result.immutoIds=counts.flatMap(el=>Array.from({length:Math.max(0,Math.min(99,Number(el.value)||0))},()=>el.dataset.immutoCount));return result;}},rejectClose:false});
}
export async function safely(fn){try{return await fn();}catch(err){console.error(ID,err);ui.notifications.error(err.message);}}
export async function checkDialog(actor,skill,kind="duel"){
  const known=SKILLS[skill];
  const title=kind==="damage"?ttbT("Флип урона"):known?.label??ASPECTS[skill]??(skill==="defense"?ttbT("Защита"):ttbT("Сила воли"));
  const content=ttbTr`<p>${e(actor.name)} · ${e(title)}</p>${known?ttbTr`<label>Аспект<select name="aspect">${choices(ASPECTS,actor.system.skills[skill].aspect)}</select></label>`:""}${kind!=="damage"?ttbTr`<label>Сложность (СЛ)<input type="number" name="tn" value="10" min="0" max="99"></label><label>Требуемые масти<input name="required" placeholder="Например: T, RR или RM"></label>`:ttbTr`<label>Урон: слабый / умеренный / тяжёлый<input name="track" value="1/2/3" pattern="[0-9]+/[0-9]+/[0-9]+" required></label><p>Модификатор точности: разница 0 → −−; 1–5 → −; 6–10 → 0; 11+ → +. Учтите его ниже.</p>`}<div class="ttb-dialog-grid"><label>Положительных (+)<input name="positive" type="number" min="0" max="99" value="0"></label><label>Отрицательных (−)<input name="negative" type="number" min="0" max="99" value="0"></label></div>${kind!=="damage"?ttbTr`<label>Числовая поправка<input name="bonus" type="number" min="-100" max="100" value="0"></label>`:""}${kind==="duel"?ttbT('<label><input type="checkbox" name="sight">Проверка требует зрения (Слепота: −−)</label><label><input type="checkbox" name="useFocus">Использовать Сосредоточенность для этого действия</label>'):''}${actor.type==="npc"&&kind==="duel"?ttbT("<p>Для проверки ПМ против ПМ каждый +/− меняет сумму на 2. Против Сужденного используйте проверку в листе игрока, развернув модификаторы ПМ.</p>"):""}`;
  const form=await formDialog(title,content,ttbT("Перевернуть карту"));if(!form)return;
  if(kind==='damage'){
    const f=await formDialog(ttbT('Цель урона'),ttbTr`${ttbT(targetHint)}<label>Цель<select name="targetUuid"><option value="">Без применения к цели</option>${targetChoices(actor)}</select></label>`);if(!f)return;form.targetUuid=f.targetUuid||null;
  }
  return request({op:"duel",actorId:actor.id,actorUuid:actor.uuid,kind,skill,action:kind==='duel'&&!['defense','willpower'].includes(skill),...form,positive:Number(form.positive),negative:Number(form.negative),track:kind==="damage"?form.track.split("/").map(Number):[1,2,3]});
}
export async function handleChat(message,op,element){
  if(op==='openHand'){const a=fromUuidSync(message.getFlag(ID,'blockedActorUuid'));if(a?.isOwner){a.sheet._tab='fate';a.sheet.render({force:true});}return;}
  if(['pursuitDraw','pursuitDecline'].includes(op))return request({op,messageId:message.id});
  const d=message.getFlag(ID,"duel"),actor=d.actorUuid?fromUuidSync(d.actorUuid):game.actors.get(d.actorId);
  if(op==='declareTrigger'){
    const options=Object.fromEntries(availableTriggers(actor.system,d).map(t=>[t.id,`${t.name} (${t.suits})`]));
    const f=await formDialog(ttbT('Объявить один триггер'),ttbTr`<label>Изученный триггер<select name="triggerId">${choices(options,'')}</select></label><label><input type="checkbox" name="confirmed" required>Условия применения по книге выполнены; эффект разрешит мастер</label>`);
    if(f)return request({op,actorUuid:actor.uuid,messageId:message.id,triggerId:f.triggerId,confirmed:f.confirmed==='on'});return;
  }
  if(op==="pick")return request({op,messageId:message.id,index:Number(element.dataset.index)});
  if(op==="finish")return request({op,messageId:message.id});
  if(['undoDamage','consciousness'].includes(op))return request({op,messageId:message.id});
  if(op==='criticalConsciousness'){
    const target=fromUuidSync(d.targetUuid),effect=d.criticalConsciousness;if(!target||!effect)return;
    const tn=effect.baseTN+Math.max(0,-target.system.wounds.value);
    const f=await formDialog(ttbT('Сознание от критической раны'),ttbTr`<p>${e(target.name)} · Жесткость · СЛ ${tn} (${effect.baseTN} + отрицательные ранения). Для ПМ используется ранг вместо карты.</p>${effect.repeat?ttbT('<p>Начинайте проверку только при действии, указанном для поражённого места. Снятие травмы контролирует мастер.</p>'):''}${effect.livingOnly?ttbT('<label><input type="checkbox" name="living" required>Цель живая и не погибла от поражения головы или груди</label>'):''}<label>Дополнительных +<input name="positive" type="number" value="0" min="0" max="99"></label><label>Дополнительных −<input name="negative" type="number" value="0" min="0" max="99"></label>`,ttbT('Начать проверку'));
    if(f)return request({op,messageId:message.id,living:f.living==='on',positive:Number(f.positive),negative:Number(f.negative)});
  }
  if(op==='applyDamage'){
    const target=fromUuidSync(d.targetUuid),swarm=target?.type==='npc'&&target.system.rankWounds;
    const f=await formDialog(ttbT('Применить урон'),ttbTr`<p>Цель: ${e(target?.name??ttbT('не найдена'))}.</p>${swarm?ttbT('<p>Обычный урон уменьшает ранг на 1; урон по площади учитывается по особенностям профиля.</p><label>Тип урона<select name="areaDamage"><option value="">Обычный</option><option value="blast">Взрыв (b)</option><option value="pulse">Импульс (p)</option></select></label>'):ttbT('<p>Броня учитывается автоматически.</p><label><input type="checkbox" name="ignoreArmor">Игнорировать броню</label>')}`,ttbT('Применить'));
    if(f)return request({op,messageId:message.id,ignoreArmor:f.ignoreArmor==='on',areaDamage:f.areaDamage??''});
  }
  if(op==='critical'){
    const f=await formDialog(ttbT('Критический эффект'),ttbT('<p>Карта вытягивается без модификаторов и Обмана судьбы. Отрицательные ранения учитываются автоматически.</p><label>Дополнительная поправка к таблице (например, Глубокая рана +2)<input name="bonus" type="number" value="0" min="-99" max="99"></label>'),ttbT('Определить'));
    if(f)return request({op,messageId:message.id,bonus:Number(f.bonus)});
  }
  if(op==='attackDamage'){
    const f=await formDialog(ttbT('Урон атаки'),ttbTr`${d.attack?.delayed?ttbT('<label><input type="checkbox" name="confirmed" required>Условие задержки выполнено; эффект срабатывает сейчас</label>'):''}<p>Урон оружия и модификатор точности берутся из завершённой атаки. Ниже укажите только дополнительные модификаторы.</p><label>Дополнительных +<input name="positive" type="number" value="0" min="0" max="99"></label><label>Дополнительных −<input name="negative" type="number" value="0" min="0" max="99"></label>`,ttbT('Перевернуть'));
    if(f)return request({op,messageId:message.id,positive:Number(f.positive),negative:Number(f.negative),confirmed:f.confirmed==='on'});
  }
  if(op==="red"){
    const f=await formDialog(ttbT("Масть красного джокера"),ttbTr`<label>Масть<select name="suit">${choices(SUITS,d.redSuit)}</select></label>`);
    if(f)return request({op,messageId:message.id,suit:f.suit});
  }
  if(op==="cheat"){
    const hand=stack("hand",actor.id);if(!hand?.cards.size)return ui.notifications.warn(ttbT("В руке нет карт для Обмана судьбы."));
    const f=await formDialog(ttbT("Обман судьбы"),ttbTr`<p>Заменить карту можно один раз. Выбранная карта покинет вашу руку.</p><label>Карта<select name="cardId">${hand.cards.map(c=>`<option value="${c.id}">${e(c.name)}</option>`).join("")}</select></label>`);
    if(f)return request({op,messageId:message.id,cardId:f.cardId});
  }
}
export class BreachSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2){
  static DEFAULT_OPTIONS={classes:["ttb","ttb-sheet"],position:{width:880,height:820},window:{resizable:true},form:{submitOnChange:true},actions:{spellBuilder:BreachSheet.spellBuilder,configureToken:BreachSheet.configureToken,creation:BreachSheet.creation,catalog:BreachSheet.catalog,sheetTab:BreachSheet.tab,skillInfo:BreachSheet.skillInfo,check:BreachSheet.check,hand:BreachSheet.hand,table:BreachSheet.table,item:BreachSheet.item,deleteRecord:BreachSheet.deleteRecord,createWeapon:BreachSheet.createWeapon,attack:BreachSheet.attack,tieOrder:BreachSheet.tieOrder,turnAction:BreachSheet.turnAction,automation:BreachSheet.automation,createRecord:BreachSheet.createRecord}};
  static PARTS={body:{template:`systems/${ID}/templates/actor.hbs`,scrollable:[".ttb-body"]}};
  static creation(){return safely(()=>createCharacter(this.actor));}
  static catalog(){return safely(()=>browseCatalog(this.actor));}
  static configureToken(){return safely(()=>this.actor.isToken?this.actor.token.sheet.render({force:true}):new CONFIG.Token.prototypeSheetClass({prototype:this.actor.prototypeToken}).render({force:true}));}
  _tab="main";
  get title(){return `${this.actor.name} · ${this.actor.type==="npc"?ttbT("Персонаж мастера"):ttbT("Сужденный")}`;}
  async _prepareContext(options){
    const context=await super._prepareContext(options),s=this.actor.system,c=derived(s),hand=stack("hand",this.actor.id);
    const canViewHand=this.actor.isOwner && hand?.testUserPermission(game.user,"OBSERVER");
    this._localizedFields=localizedEditableFields(this.actor);
    const draft=this.actor.getFlag(ID,'creation');
    if(draft?.complete&&draft.cards?.length===5){
      const tables=await tarotTables(),rows=draft.cards.map(card=>tables[`${card.value}-${card.suit}`]);
      if(rows.every(Boolean)){
        const pieces=['endeavor','mind','root','body','station'].map((kind,i)=>rows[4-i].fate[kind]);
        if(s.fate===pieces.join(' '))this._localizedFields['system.fate']=pieces.map(ttbT).join(' ');
        if(s.station===rows[0].station.name)this._localizedFields['system.station']=ttbT(s.station);
      }
    }
    const displaySystem=s.toObject();
    for(const[path,value]of Object.entries(this._localizedFields))if(path.startsWith('system.')&&value!==undefined)foundry.utils.setProperty(displaySystem,path.slice(7),value);
    return {...context,systemVersion:game.system.version,actor:{id:this.actor.id,img:this.actor.img,name:this._localizedFields.name},s:displaySystem,c,isGM:game.user.isGM,isNPC:this.actor.type==="npc",editable:this.isEditable,
      movementMode:game.user.isGM&&game.settings.get(ID,'gmFreeMovement')===true?ttbT('Свободная расстановка'):this.actor.getFlag(ID,'difficultWalk')===true?ttbT('Ходьба · трудная местность'):ttbT('Ходьба на карте'),
      bestiary:this.actor.getFlag(ID,'bestiary'),tokenImg:this.actor.prototypeToken?.texture?.src||this.actor.img,
      effects:s.effects.map(x=>({...x,label:EFFECT_LABELS[x.kind]??x.kind,timed:!!x.ends})),
      turnPending:!!game.combat?.getFlag(ID,'turnPending'),
      creationComplete:!!this.actor.flags?.[ID]?.creation?.complete,hasStates:!!(s.effects.length||s.bleeding||s.unconscious||s.prone||s.dead),
      tabs:[['main',ttbT('Персонаж')],['skills',ttbT('Навыки')],['fate',ttbT('Судьба')],['story',ttbT('История')],['records',ttbT('Снаряжение и магия')],['development',ttbT('Развитие')]].map(([id,label])=>({id,label,icon:`systems/${ID}/assets/ui/${id}.svg`,active:this._tab===id})),
      pursuitOptions:{'':ttbT('Без отдельной записи'),...Object.fromEntries(this.actor.items.filter(i=>i.type==='talent'&&i.system.category==='pursuit').map(i=>[i.id,documentName(i)]))},
      controllerOptions:{'':ttbT('Нет владельца'),...Object.fromEntries(game.actors.filter(a=>a.type==='fated').map(a=>[a.uuid,a.name]))},
      recordsTab:this._tab==='records',developmentTab:this._tab==='development',
      records:this.actor.items.map(i=>({id:i.id,name:documentName(i),type:i.type,img:itemArtwork(i),...i.system.toObject(),description:localizedField(i,'system.description'),reference:localizedField(i,'system.reference'),range:localizedField(i,'system.range'),isMagic:i.type==='magic'&&['spell','magia'].includes(i.system.magicKind),isGrimoire:i.type==='magic'&&i.system.magicKind==='grimoire',isEquipment:i.type==='equipment',rating:i.system.isWeapon?weaponRating(this.actor,i).label:'',step:s.pursuitProgress.find(x=>x.id===i.id)?.step??0})),
      pursuitRows:s.pursuitProgress.map(x=>({name:documentName(this.actor.items.get(x.id))??x.id,step:x.step,maximum:this.actor.items.get(x.id)?.system.stepMax})),
      epilogues:s.epilogues.map(x=>({...x,rewardAvailable:x.rewardStep>0&&!x.rewardChosen,eligibleNames:x.eligible.map(k=>SKILLS[k]?.label).join(', '),chosenName:SKILLS[x.chosen]?.label})),triggers:s.learnedTriggers.map(x=>({...x,skillName:SKILLS[x.skill]?.label})),
      main:this._tab==="main",skillsTab:this._tab==="skills",fateTab:this._tab==="fate",storyTab:this._tab==="story",
      aspects:Object.entries(ASPECTS).map(([key,label])=>({key,label,value:s.aspects[key],temporary:s.temporaryAspects[key],total:aspectValue(s,key)})),aspectOptions:ASPECTS,suitOptions:SUITS,
      skillGroups:Object.entries(GROUPS).map(([id,label])=>({id,label,skills:Object.values(SKILLS).filter(k=>k.group===id).map(k=>({...k,...s.skills[k.id],av:skillValue(s,k.id),help:SKILL_HELP[k.id]?.[1],page:SKILL_HELP[k.id]?.[0],aspectName:ASPECTS[s.skills[k.id].aspect]}))})),
      stats:[['defense',ttbT('Защита')],['willpower',ttbT('Сила воли')],['wounds',s.rankWounds?ttbT('Ранг роя'):ttbT('Макс. ранений')],['initiative',ttbT('Инициатива')],['walk',ttbT('Ходьба')],['charge',ttbT('Рывок')]].map(([id,label])=>({id,label,value:c[id],bonus:s.bonuses[id]})),
      twistRoles:TWIST_ROLES.map((label,i)=>({label,index:i,suit:s.twist[i]})),hasDeck:!!stack("twist",this.actor.id),
      handCards:canViewHand?hand.cards.map(card=>({id:card.id,name:cardName(card),img:cardImage(card.faces[0]?.img)})):[],
      handCount:canViewHand?hand.cards.size:0,overflow:canViewHand&&hand.cards.size>5,credits:canViewHand?(hand.getFlag(ID,"credits")??0):0,refresh:canViewHand&&hand.getFlag(ID,"refresh"),
      masterOnline:!!authority(),npcDefense:c.defense+statRank(s,'defense'),npcWillpower:c.willpower+statRank(s,'willpower'),
      items:this.actor.items.map(item=>({id:item.id,name:documentName(item),description:localizedField(item,'system.description'),quantity:item.system.quantity})),
      weapons:this.actor.items.filter(item=>item.system.isWeapon).map(item=>({id:item.id,name:documentName(item),range:localizedField(item,'system.range'),damage:item.system.damage,skill:SKILLS[item.system.skill]?.label})),
      openChecks:game.messages.filter(m=>m.author?.isGM&&m.getFlag(ID,"duel")?.actorId===this.actor.id&&!m.getFlag(ID,"duel").closed).map(m=>({id:m.id,label:m.getFlag(ID,"duel").label}))
    };
  }
  _processFormData(event,form,formData){
    const result=super._processFormData(event,form,formData);
    if(result.system?.twist)result.system.twist=Object.values(result.system.twist);
    return preserveTranslatedFields(result,this.actor,this._localizedFields);
  }
  _folds=new Map();
  _skillSearch='';
  _trainedOnly=false;
  async _onRender(context,options){
    await super._onRender(context,options);
    this.element.querySelector('[data-pursuit-select]')?.addEventListener('change',event=>{event.stopPropagation();safely(()=>request({op:'adoptPursuit',actorUuid:this.actor.uuid,pursuitId:event.target.value})).finally(()=>this.render());});
    this.element.querySelectorAll('[data-hand-card]').forEach(el=>el.addEventListener('change',event=>event.stopPropagation()));
    this.element.querySelectorAll('details[data-fold]').forEach(el=>{
      if(this._folds.has(el.dataset.fold))el.open=this._folds.get(el.dataset.fold);
      el.addEventListener('toggle',()=>this._folds.set(el.dataset.fold,el.open));
    });
    this.element.querySelectorAll('.ttb-skill-label').forEach(label=>{
      const place=()=>{
        const tip=label.querySelector('.ttb-skill-tip'),body=this.element.querySelector('.ttb-body');
        label.classList.toggle('tip-above',label.getBoundingClientRect().bottom+tip.offsetHeight+8>body.getBoundingClientRect().bottom);
      };
      label.addEventListener('mouseenter',place);label.addEventListener('focusin',place);
    });
    const search=this.element.querySelector('[data-skill-search]'),trained=this.element.querySelector('[data-trained-only]');
    if(!search)return;
    search.value=this._skillSearch;trained.checked=this._trainedOnly;
    const filter=()=>{
      const query=this._skillSearch.trim().toLocaleLowerCase('ru');let count=0;
      this.element.querySelectorAll('[data-skill-group]').forEach(group=>{
        let visible=0;
        group.querySelectorAll('[data-skill-entry]').forEach(row=>{
          row.hidden=!(row.dataset.label.toLocaleLowerCase('ru').includes(query)&&(!this._trainedOnly||Number(row.querySelector('input[name$=".rank"]').value)>0));
          if(!row.hidden)visible++;
        });
        group.hidden=!visible;count+=visible;if(query&&visible)group.open=true;
      });
      this.element.querySelector('[data-skill-empty]').hidden=!!count;
    };
    search.addEventListener('input',event=>{event.stopPropagation();this._skillSearch=search.value;filter();});
    search.addEventListener('change',event=>event.stopPropagation());
    trained.addEventListener('change',event=>{event.stopPropagation();this._trainedOnly=trained.checked;filter();});
    filter();
  }
  static tab(_event,target){this._tab=target.dataset.tab;this.render();}
  static skillInfo(_event,target){return safely(async()=>{
    const skill=SKILLS[target.dataset.skill],help=SKILL_HELP[skill?.id];
    if(!this.actor.isOwner||!help)return;
    return ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:this.actor}),content:ttbTr`<section class="ttb-chat ttb-skill-reference"><header>${e(skill.label)}</header><p>${e(help[1])}</p><footer>Основная книга, стр. ${help[0]} · Краткая справка</footer></section>`});
  });}
  static turnAction(_event,target){return safely(async()=>{
    const op=target.dataset.op;
    if(op==='walkAction'){
      const f=await formDialog(ttbT('Ходьба на карте'),ttbTr`<p>Перетащите токен по карте: только в запущенном бою один путь до ${derived(this.actor.system).walk} ярдов автоматически стоит 1 ОД. Для ломаного пути используйте точки маршрута Foundry. В бою каждое отдельное перемещение — новое действие; после других действий остаток расстояния не сохраняется. Вне боя токены двигаются свободно, без расхода ОД и ограничения расстояния Ходьбой.</p><p>Области с повышенной стоимостью движения Foundry учитываются по участкам. Флажок ниже удваивает каждый путь, пока включён: используйте его только для местности, не размеченной на карте.</p><label><input type="checkbox" name="difficult" ${this.actor.getFlag(ID,'difficultWalk')?'checked':''}>Весь путь по трудной местности (без размеченной области)</label>${game.user.isGM?ttbTr`<label><input type="checkbox" name="free" ${game.settings.get(ID,'gmFreeMovement')?'checked':''}>Свободная расстановка мастером — без ОД</label>`:''}<p>Выход из боя, опасную местность и особое перемещение предварительно разрешает мастер.</p>`,ttbT('Сохранить режим'));
      if(f){await this.actor.setFlag(ID,'difficultWalk',f.difficult==='on');if(game.user.isGM)await game.settings.set(ID,'gmFreeMovement',f.free==='on');}return;
    }
    if(op==='recoverTurn'){
      const f=await formDialog(ttbT('Подтвердить последствия хода'),ttbT('<p>Сверьте ОД, кровотечение и состояния участников с чатом. Исправьте поля вручную. Подтверждение снимает блокировку и помечает прерванный шаг обработанным; повторно он не выполняется.</p>'),ttbT('Последствия проверены'));
      if(!f)return;
    }
    if(op==='addEffect'){
      const f=await formDialog(ttbT('Добавить состояние'),ttbTr`<label>Состояние<select name="kind">${choices(EFFECT_LABELS,'slow')}</select></label><label>Значение (для числовых состояний)<input name="value" type="number" min="1" max="99" value="1"></label><label><input type="checkbox" name="temporary">Явно продлить до конца следующего хода</label><p>По умолчанию Быстрота, Замедление, Паралич и Сосредоточенность заканчиваются в конце текущего или ближайшего хода; Оборона — в начале следующего.</p>`,ttbT('Добавить'));
      if(f)return request({op,actorUuid:this.actor.uuid,kind:f.kind,value:Number(f.value),temporary:f.temporary==='on'});return;
    }
    return request({op,actorUuid:this.actor.uuid,cost:Number(target.dataset.cost??0),effectId:target.dataset.effectId});
  });}
  static table(){new FateTable().render({force:true});}
  static spellBuilder(){if(this.isEditable)new SpellBuilder(this.actor).render({force:true});}
  static createRecord(_event,target){return safely(async()=>{if(!this.isEditable)return;const type=target.dataset.type??'equipment',category=target.dataset.category??'',magicKind=target.dataset.magicKind??'spell';const [item]=await this.actor.createEmbeddedDocuments('Item',[{name:category==='pursuit'?ttbT('Новое Стремление'):type==='magic'?ttbT('Новая магическая запись'):type==='talent'?ttbT('Новый талант'):ttbT('Новый предмет'),type,system:{category,magicKind,skill:type==='magic'?'sorcery':'melee'}}]);item.sheet.render({force:true});});}
  static automation(_event,target){return safely(async()=>{
    if(!this.isEditable)return;const op=target.dataset.op,item=this.actor.items.get(target.dataset.itemId);let f;
    const skills=Object.fromEntries(Object.values(SKILLS).map(k=>[k.id,k.label]));
    if(op==='reload')f=await formDialog(ttbT('Перезарядка'),ttbTr`<p>${e(documentName(item))}: ${item.system.loaded}/${item.system.capacity}, запас ${item.system.reserve}. Оплачено ${item.system.reloadProgress}/${item.system.reloadCost} ОД. Вне боя перезаряжается полностью без расхода ОД.</p><label>Оплатить ОД<input name="cost" type="number" value="1" min="1" max="99"></label>`);
    else if(op==='heal')f=await formDialog(ttbT('Исцеление'),ttbT('<p>Укажите итог уже разрешённого исцеления. Максимум ранений учитывается; при результате от 1 ранения персонаж приходит в сознание. Сбит с ног и травмы сохраняются.</p><label>Восстановить ранений<input type="number" name="amount" value="1" min="1" max="999"></label>'));
    else if(op==='epilogue')f=await formDialog(ttbT('Открыть эпилог'),ttbTr`<label>Уникальное название сессии<input name="session" required></label><label>Первый навык<select name="first">${choices(skills,'notice')}</select></label><label>Второй навык<select name="second">${choices(skills,'evade')}</select></label><label>Продвигаемое Стремление<select name="pursuitId"><option value="">Без записи Стремления (шаг отметить вручную)</option>${this.actor.items.filter(i=>i.type==='talent'&&i.system.category==='pursuit').map(i=>`<option value="${e(i.id)}">${e(documentName(i))}</option>`).join('')}</select></label><p>Выдаётся 1 опыт и 1 шаг выбранного Стремления. Талант шага выберите в разделе «Развитие»; для продвинутого Стремления мастер проверяет требования.</p>`);
    else if(op==='advanceSkill'){const ep=this.actor.system.epilogues.find(x=>x.id===target.dataset.epilogueId);f=await formDialog(ttbT('Повысить один навык'),ttbTr`<p>За этот эпилог можно повысить один навык. 0 → 1 бесплатно; иначе цена — текущий ранг. Максимум 5.</p><label>Навык<select name="skill">${choices(Object.fromEntries(ep.eligible.map(k=>[k,ttbTr`${SKILLS[k].label}: ранг ${this.actor.system.skills[k].rank}, цена ${this.actor.system.skills[k].rank}`])),ep.eligible[0])}</select></label>`);}
    else if(op==='choosePursuitTalent'){
      const ep=this.actor.system.epilogues.find(x=>x.id===target.dataset.epilogueId),allowed=await rewardChoices(this.actor,ep),magic=await catalogDocuments('magic');
      f=await formDialog(ttbTr`Талант шага ${ep.rewardStep}`,ttbTr`<label>Талант<select name="talentUuid" required><option value="">Выберите талант</option>${allowed.map(i=>`<option value="${e(i.uuid)}">${e(documentName(i))}</option>`).join('')}</select></label><label>Для «Освоенной магии» / «Освоенного иммуто»<select name="componentUuid"><option value="">Не требуется</option>${magic.filter(i=>['magia','immuto'].includes(catalogMeta(i).kind)).map(i=>`<option value="${e(i.uuid)}">${e(documentName(i))}</option>`).join('')}</select></label><label><input type="checkbox" name="confirmed" required>Требования и условия таланта проверены по описанию в библиотеке</label><p>В списке только варианты этого шага. Условные эффекты сверяйте по описанию; освоенный компонент будет доступен вне Гримуара.</p>`,ttbT('Получить талант'));
    }
    else if(op==='learnTrigger')f=await formDialog(ttbT('Изучить триггер'),ttbTr`<p>Цена: 1 опыт. Одно место при ранге 3, два при ранге 5. Изученные при создании триггеры заносит мастер по правилам создания.</p>${game.user.isGM?ttbT('<label><input type="checkbox" name="creation">Бесплатный триггер при создании персонажа (один за навык)</label>'):''}<label>Навык<select name="skill">${choices(skills,'pistol')}</select></label><label>Название<input name="name" required></label><label>Масти<input name="suits" placeholder="R, TT, RM"></label><label>Эффект и условия<textarea name="description"></textarea></label>`);
    else if(op==='castSpell'){
      const plan=spellPlan(this.actor,item,[],true),prepared=!!item.system.spellBaseId;
      f=await formDialog(ttbTr`Магия: ${documentName(item)}`,ttbTr`<p>СЛ ${plan.tn} ${e(plan.required)}, ${plan.ap} ОД; ${e(plan.range??item.system.range)}; длительность ${e(plan.duration??item.system.duration)}.</p>${ttbT(targetHint)}<label>Цель<select name="targetUuid" ${plan.resistance||plan.damageTrack?'required':''}><option value="">Выберите цель / без цели</option>${targetChoices(this.actor)}</select></label>${prepared?ttbT('<p>Магия и Иммуто уже учтены в сохранённом составе.</p>'):ttbTr`<p>Для выбора параметров и повторений Иммуто используйте «Создать заклинание». Здесь можно произнести основу или добавить заранее настроенные Иммуто.</p>${this.actor.items.filter(i=>i.type==='magic'&&i.system.magicKind==='immuto'&&i.system.equipped&&!i.getFlag(ID,'catalog')?.configurationRequired).map(i=>`<label>${e(documentName(i))}<input data-immuto-count="${e(i.id)}" name="immutoCount-${e(i.id)}" type="number" min="0" max="${i.system.maxCopies}" value="0"></label>`).join('')}`}<label>Дополнительных +<input name="positive" type="number" min="0" value="0"></label><label>Дополнительных −<input name="negative" type="number" min="0" value="0"></label><label>Числовая поправка к дуэли<input name="bonus" type="number" value="0"></label>${game.user.isGM?ttbT('<div class="ttb-dialog-grid"><label>Сопротивление Сужденного: +<input name="defPositive" type="number" min="0" value="0"></label><label>Сопротивление Сужденного: −<input name="defNegative" type="number" min="0" value="0"></label></div>'):''}<label><input type="checkbox" name="sight" checked>Требует зрения (Слепота: −−)</label><label><input type="checkbox" name="useFocus">Использовать Сосредоточенность</label><label><input type="checkbox" name="earth">На Земле (дополнительный −)</label><label><input type="checkbox" name="willing">Цель добровольно принимает эффект</label><label><input type="checkbox" name="confirmed" required>Требования Магии, Иммуто и магической теории проверены; их особые эффекты применяет мастер</label><p>Парную дуэль против сопротивляющегося Сужденного запускает мастер.</p>`);
    }
    else if(op==='attune')f=await formDialog(ttbT('Настройка на Гримуар'),ttbT('<p>Мастер подтверждает завершённую настройку. Для заклинаний будет доступен один выбранный Гримуар. Поддержание памяти и исключения талантов пока контролируются вручную.</p>'));
    else if(op==='recoverOperation')f=await formDialog(ttbT('Снять блокировку операции'),ttbT('<p>Сверьте ОД, патроны, записи и последние действия. Исправьте последствия вручную. Эта кнопка только снимает блокировку и не повторяет действие.</p>'));
    else if(op==='buyItem')f=await formDialog(ttbT('Купить предмет'),ttbTr`<p>Купить одну единицу «${e(documentName(item))}» за ${item.system.price} скрипов? Проверьте цену и наличие у продавца.</p>`);
    else if(op==='useItem')f=await formDialog(ttbT('Использовать предмет'),ttbTr`<p>Количество «${e(documentName(item))}» уменьшится на 1. Особые эффекты и ОД применения разрешите отдельно.</p>`);
    else throw Error(ttbT('Неизвестная кнопка.'));
    if(!f)return;
    // FormData needs getAll for a multiple select: formDialog preserves its array below.
    return request({op,actorUuid:this.actor.uuid,itemId:item?.id,epilogueId:target.dataset.epilogueId,...f,eligible:op==='epilogue'?[f.first,f.second]:undefined,immutoIds:f.immutoIds??[],creation:f.creation==='on',confirmed:f.confirmed==='on',earth:f.earth==='on',willing:f.willing==='on'});
  });}
  static item(_event,target){this.actor.items.get(target.dataset.itemId)?.sheet.render({force:true});}
  static deleteRecord(_event,target){return safely(async()=>{
    if(!this.isEditable||!this.actor.isOwner)return;
    const item=this.actor.items.get(target.dataset.itemId);if(!item)return;
    const grimoire=item.system.magicKind==='grimoire';
    const confirmed=await DialogV2.confirm({window:{title:ttbT('Удалить запись?')},content:ttbTr`<div class="ttb-dialog"><p>Удалить «${e(documentName(item))}» из листа персонажа?</p><p>Будет удалена вся запись, включая всё указанное количество. Скрипы не возвращаются.${grimoire?ttbT(' Связанные Магии и Иммуто останутся, но их применение потребует другого Гримуара и ручной смены привязки.'):''}</p></div>`,yes:{label:ttbT('Удалить')},no:{label:ttbT('Отмена')},rejectClose:false});
    if(confirmed)await removeRecord(this.actor,item.id);
  });}
  static createWeapon(){return safely(async()=>{if(!this.isEditable)return;const [item]=await this.actor.createEmbeddedDocuments('Item',[{name:ttbT('Новое оружие'),type:'equipment',system:{isWeapon:true}}]);item.sheet.render({force:true});});}
  static attack(_event,target){return safely(async()=>{
    if(!this.isEditable)return;
    const item=this.actor.items.get(target.dataset.itemId);
    const defenseModifiers=game.user.isGM?ttbT('<p>Для цели-Сужденного: модификаторы её защиты (для ПМ не используются).</p><label>Защита: +<input name="defPositive" type="number" value="0" min="0" max="99"></label><label>Защита: −<input name="defNegative" type="number" value="0" min="0" max="99"></label>'):'';
    const f=await formDialog(ttbTr`Атака: ${documentName(item)}`,ttbTr`<p>Дальность: ${e(item.system.range)}. Расстояние, укрытие и особые свойства проверяет мастер. Патроны списываются автоматически при включённом учёте боезапаса.</p>${ttbT(targetHint)}<p>${e(weaponRating(this.actor,item).label)}</p><label>Цель<select name="targetUuid" required><option value="">Выберите цель</option>${targetChoices(this.actor)}</select></label><label>Положительных +<input name="positive" type="number" value="0" min="0" max="99"></label><label>Отрицательных −<input name="negative" type="number" value="0" min="0" max="99"></label><label>Числовая поправка к атаке<input name="bonus" type="number" value="0"></label><label><input name="useFocus" type="checkbox">Использовать Сосредоточенность</label><label><input name="sight" type="checkbox" checked>Атака требует зрения (Слепота: −−)</label>${defenseModifiers}`,ttbT('Атаковать'));
    if(f)return request({op:'attack',actorUuid:this.actor.uuid,itemId:item.id,...f,sight:f.sight==='on'});
  });}
  static tieOrder(){return safely(async()=>{
    if(!game.user.isGM)return;
    const c=game.combat?.combatants.find(c=>c.actor?.uuid===this.actor.uuid);
    if(!c)return ui.notifications.warn(ttbT('Сначала добавьте персонажа в активное сражение.'));
    const f=await formDialog(ttbT('Порядок при ничьей'),ttbT('<p>При равной инициативе сначала ходит Сужденный, затем персонаж с большей Скоростью. При полном равенстве меньшее число идёт раньше. Меняйте порядок по договорённости в каждом раунде.</p><label>Порядок<input name="order" type="number" value="0" min="0"></label>'),ttbT('Сохранить'));
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
  get title(){return documentName(this.document);}
  localizedSystem(){
    this._localizedFields=localizedEditableFields(this.document);
    const data=this.document.system.toObject();
    for(const[path,value]of Object.entries(this._localizedFields))if(path.startsWith('system.')&&value!==undefined)foundry.utils.setProperty(data,path.slice(7),value);
    return data;
  }
  _processFormData(event,form,data){return preserveTranslatedFields(super._processFormData(event,form,data),this.document,this._localizedFields);}

  async _prepareContext(options){return {...await super._prepareContext(options),item:{name:documentName(this.document)},itemImg:itemArtwork(this.document),s:this.localizedSystem(),pursuitOption:{pursuit:ttbT('Стремление')},grimoireOptions:{'':ttbT('Вне Гримуара (талант / проявленная сила)'),...Object.fromEntries((this.document.parent?.items??[]).filter(i=>i.type==='magic'&&i.system.magicKind==='grimoire').map(i=>[i.id,documentName(i)]))},isGM:game.user.isGM,isMagic:this.document.type==='magic',isTalent:this.document.type==='talent',isEquipment:this.document.type==='equipment',aspectOptions:ASPECTS,magicOptions:{spell:ttbT('Подготовленное заклинание'),magia:ttbT('Магия'),immuto:ttbT('Иммуто'),grimoire:ttbT('Гримуар')},bonusOptions:{'':ttbT('Нет'),...Object.fromEntries(Object.entries(ASPECTS).map(([k,v])=>[`aspect.${k}`,ttbTr`Аспект: ${v}`])),...Object.fromEntries(Object.values(SKILLS).map(k=>[`skill.${k.id}`,ttbTr`Навык: ${k.label}`])),defense:ttbT('Защита'),willpower:ttbT('Сила воли'),wounds:ttbT('Макс. ранений'),initiative:ttbT('Инициатива'),walk:ttbT('Ходьба'),charge:ttbT('Рывок'),armor:ttbT('Броня')},skillOptions:Object.fromEntries(Object.values(SKILLS).map(k=>[k.id,k.label])),defenseOptions:{defense:ttbT('Защита'),willpower:ttbT('Сила воли')},resistanceOptions:{'':ttbT('Нет'),defense:ttbT('Защита'),willpower:ttbT('Сила воли')},slotOptions:{'':ttbT('Нет'),arms:ttbT('Руки'),legs:ttbT('Ноги'),head:ttbT('Голова'),chest:ttbT('Грудь')},armorOptions:{'':ttbT('Нет'),light:ttbT('Лёгкая'),heavy:ttbT('Тяжёлая')}};}
}
export class FateTable extends HandlebarsApplicationMixin(ApplicationV2){
  get title(){return ttbT('Стол Судьбы');}
  static DEFAULT_OPTIONS={id:"ttb-fate-table",classes:["ttb","ttb-table"],window:{title:ttbT("Стол Судьбы"),resizable:true},position:{width:740,height:680},actions:{manage:FateTable.manage,actor:FateTable.actor}};
  static PARTS={body:{template:`systems/${ID}/templates/table.hbs`,scrollable:[".ttb-body"]}};
  async _prepareContext(){return {
    dramatic:game.combat?.started===true||game.settings.get(ID,'dramaticTime')===true,isGM:game.user.isGM,masterOnline:!!authority(),ready:!!stack("fate"),remaining:game.user.isGM?stack("fate")?.availableCards.length:undefined,
    discarded:game.user.isGM?stack("discard")?.cards.size:undefined,active:game.user.isGM?stack("active")?.cards.size:undefined,
    tasks:game.messages.filter(m=>m.author?.isGM&&m.getFlag(ID,'ongoing')).map(m=>{const t=m.getFlag(ID,'ongoing');return {id:m.id,...t,isGM:game.user.isGM,canContribute:t.status==='open'&&t.participants.some(a=>fromUuidSync(a.uuid)?.isOwner),open:t.status==='open',recovery:t.rows.filter(r=>r.interval===t.interval&&(r.pending||r.cancelled)).map(r=>({...r,name:fromUuidSync(r.actorUuid)?.name??r.actorUuid}))};}),
    bonuses:game.messages.filter(m=>m.author?.isGM&&m.getFlag(ID,'duel')?.pursuitBonus?.status==='pending'&&game.user.isGM).map(m=>({id:m.id,name:m.getFlag(ID,'duel').actorName})),
    characters:game.actors.filter(a=>a.type==="fated"&&a.isOwner).map(a=>{const hand=stack("hand",a.id);return {id:a.id,name:a.name,ready:!!hand,count:hand?.cards.size??0,credits:hand?.getFlag(ID,'credits')??0,isGM:game.user.isGM};}),
    openChecks:game.user.isGM?game.messages.filter(m=>m.author?.isGM&&m.getFlag(ID,"duel")&&!m.getFlag(ID,"duel").closed).map(m=>({id:m.id,label:`${m.getFlag(ID,"duel").actorName} · ${m.getFlag(ID,"duel").label}`})):[]
  };}
  static actor(_event,target){game.actors.get(target.dataset.actorId)?.sheet.render({force:true});}
  static manage(_event,target){return safely(async()=>{
    const op=target.dataset.op;
    if(op==='openHand'){const a=game.actors.get(target.dataset.actorId);if(a?.isOwner){const app=a.sheet;app._tab='fate';app.render({force:true});}return;}
    if(op==='taskCreate'){
      const actors=game.actors.filter(a=>a.type==='fated'),f=await formDialog(ttbT('Текущее Соревнование'),ttbTr`<label>Название<input name="name" required maxlength="120"></label><label>Длительность интервала<input name="duration" value="5 минут" maxlength="120"></label><label>СЛ<input name="tn" type="number" min="0" max="99" value="10"></label><label>Аспект<select name="aspect">${choices(ASPECTS,'intellect')}</select></label><label>Нужные успехи<input name="goal" type="number" min="1" max="999" value="6"></label><label>Пределы Провала до катастрофы<input name="limit" type="number" min="1" max="999" value="3"></label><label>Допустимые навыки<select name="skills" multiple required>${choices(Object.fromEntries(Object.values(SKILLS).map(s=>[s.id,s.label])),'engineering')}</select></label><label>Участники<select name="actorUuids" multiple required>${actors.map(a=>`<option value="${e(a.uuid)}" selected>${e(a.name)}</option>`).join('')}</select></label>`,ttbT('Создать задачу'));
      if(f)await request({op,...f,tn:Number(f.tn),goal:Number(f.goal),limit:Number(f.limit)});this.render();return;
    }
    if(op==='taskContribute'){
      const t=game.messages.get(target.dataset.messageId)?.getFlag(ID,'ongoing');if(!t)return;
      const actors=t.participants.filter(x=>fromUuidSync(x.uuid)?.isOwner),f=await formDialog(ttbT('Вклад в общую задачу'),ttbTr`<p>${e(t.name)} · интервал ${t.interval} · СЛ ${t.tn}</p><label>Персонаж<select name="actorUuid" required>${actors.map(a=>`<option value="${e(a.uuid)}">${e(a.name)}</option>`).join('')}</select></label><label>Навык<select name="skill">${choices(Object.fromEntries(t.skills.map(k=>[k,SKILLS[k].label])),t.skills[0])}</select></label><label>Дополнительных +<input name="positive" type="number" min="0" max="99" value="0"></label><label>Дополнительных −<input name="negative" type="number" min="0" max="99" value="0"></label>`,ttbT('Начать проверку'));
      if(f)await request({op,messageId:target.dataset.messageId,...f,positive:Number(f.positive),negative:Number(f.negative)});this.render();return;
    }
    if(op==='pursuitRecover'){
      const f=await formDialog(ttbT('Восстановить добор'),ttbT('<p>Сверьте руку и последнюю выдачу в чате. Карта повторно не вытягивается.</p><label>Итог<select name="resolution"><option value="taken">Карта уже выдана</option><option value="declined">Карта не выдана; добор закрыть</option></select></label>'),ttbT('Подтвердить'));if(f)await request({op,messageId:target.dataset.messageId,...f});return;
    }
    const prompts={shuffle:ttbT("Перетасовать общую колоду вместе со сбросом и разрешить каждому игроку взять одну Смешанную карту?"),prologue:ttbT("Раздать ещё по три карты всем подготовленным Сужденным? Нажимайте один раз в конце пролога."),endDrama:ttbT("Разрешить всем Сужденным сбросить выбранные карты и добрать до трёх?"),recover:ttbT("Отменить эту незавершённую проверку и отправить её удерживаемые карты в сброс?")};
    if(prompts[op]&&!await DialogV2.confirm({window:{title:ttbT("Стол Судьбы")},content:`<p>${prompts[op]}</p>`,yes:{label:ttbT("Продолжить")},no:{label:ttbT("Отмена")}}))return;
    await request({op,actorId:target.dataset.actorId,actorUuid:target.dataset.actorUuid,messageId:target.dataset.messageId});this.render();
  });}
}
