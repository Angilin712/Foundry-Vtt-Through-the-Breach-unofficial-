import {ID,SUITS,SYMBOLS,ASPECTS,SKILLS,GROUPS,TWIST_ROLES,derived,canCheat,escapeHTML as e} from "./rules.mjs";
import {stack,request,authority} from "./cards.mjs";
const {HandlebarsApplicationMixin,ApplicationV2,DialogV2}=foundry.applications.api;
const choices=(values,selected)=>Object.entries(values).map(([k,v])=>`<option value="${e(k)}" ${k===selected?"selected":""}>${e(v)}</option>`).join("");
async function formDialog(title,content,label="Продолжить"){
  return DialogV2.prompt({window:{title},content:`<div class="ttb-dialog">${content}</div>`,ok:{label,callback:(_event,button)=>Object.fromEntries(new FormData(button.form).entries())},rejectClose:false});
}
export async function safely(fn){try{return await fn();}catch(err){console.error(ID,err);ui.notifications.error(err.message);}}
export async function checkDialog(actor,skill,kind="duel"){
  const known=SKILLS[skill];
  const title=kind==="damage"?"Флип урона":known?.label??ASPECTS[skill]??(skill==="defense"?"Защита":"Сила воли");
  const content=`<p>${e(actor.name)} · ${e(title)}</p>${known?`<label>Аспект<select name="aspect">${choices(ASPECTS,actor.system.skills[skill].aspect)}</select></label>`:""}${kind!=="damage"?`<label>Сложность (СЛ)<input type="number" name="tn" value="10" min="0" max="99"></label><label>Требуемые масти<input name="required" placeholder="Например: T, RR или RM"></label>`:`<label>Урон: слабый / умеренный / тяжёлый<input name="track" value="1/2/3" pattern="[0-9]+/[0-9]+/[0-9]+" required></label><p>Модификатор точности: разница 0 → −−; 1–5 → −; 6–10 → 0; 11+ → +. Учтите его ниже.</p>`}<div class="ttb-dialog-grid"><label>Положительных (+)<input name="positive" type="number" min="0" max="99" value="0"></label><label>Отрицательных (−)<input name="negative" type="number" min="0" max="99" value="0"></label></div>${kind!=="damage"?`<label>Числовая поправка<input name="bonus" type="number" min="-100" max="100" value="0"></label>`:""}${actor.type==="npc"&&kind==="duel"?"<p>Для проверки ПМ против ПМ каждый +/− меняет сумму на 2. Против Сужденного используйте проверку в листе игрока, развернув модификаторы ПМ.</p>":""}`;
  const form=await formDialog(title,content,"Перевернуть карту");if(!form)return;
  return request({op:"duel",actorId:actor.id,actorUuid:actor.uuid,kind,skill,...form,positive:Number(form.positive),negative:Number(form.negative),track:kind==="damage"?form.track.split("/").map(Number):[1,2,3]});
}
export async function handleChat(message,op,element){
  const d=message.getFlag(ID,"duel"),actor=d.actorUuid?fromUuidSync(d.actorUuid):game.actors.get(d.actorId);
  if(op==="pick")return request({op,messageId:message.id,index:Number(element.dataset.index)});
  if(op==="finish")return request({op,messageId:message.id});
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
  static DEFAULT_OPTIONS={classes:["ttb","ttb-sheet"],position:{width:880,height:820},window:{resizable:true},form:{submitOnChange:true},actions:{sheetTab:BreachSheet.tab,check:BreachSheet.check,hand:BreachSheet.hand,table:BreachSheet.table,item:BreachSheet.item}};
  static PARTS={body:{template:`systems/${ID}/templates/actor.hbs`,scrollable:[".ttb-body"]}};
  _tab="main";
  get title(){return `${this.actor.name} · ${this.actor.type==="npc"?"Персонаж мастера":"Сужденный"}`;}
  async _prepareContext(options){
    const context=await super._prepareContext(options),s=this.actor.system,c=derived(s),hand=stack("hand",this.actor.id);
    const canViewHand=this.actor.isOwner && hand?.testUserPermission(game.user,"OBSERVER");
    return {...context,systemVersion:game.system.version,actor:this.actor,s,c,isGM:game.user.isGM,isNPC:this.actor.type==="npc",editable:this.isEditable,
      tabs:[['main','Персонаж'],['skills','Навыки'],['fate','Судьба и рука'],['story','Снаряжение и история']].map(([id,label])=>({id,label,active:this._tab===id})),
      main:this._tab==="main",skillsTab:this._tab==="skills",fateTab:this._tab==="fate",storyTab:this._tab==="story",
      aspects:Object.entries(ASPECTS).map(([key,label])=>({key,label,value:s.aspects[key]})),aspectOptions:ASPECTS,suitOptions:SUITS,
      skillGroups:Object.entries(GROUPS).map(([id,label])=>({label,skills:Object.values(SKILLS).filter(k=>k.group===id).map(k=>({...k,...s.skills[k.id],av:s.skills[k.id].rank+s.aspects[s.skills[k.id].aspect]}))})),
      stats:[['defense','Защита'],['willpower','Сила воли'],['wounds','Макс. ранений'],['initiative','Инициатива'],['walk','Ходьба'],['charge','Рывок']].map(([id,label])=>({id,label,value:c[id],bonus:s.bonuses[id]})),
      twistRoles:TWIST_ROLES.map((label,i)=>({label,index:i,suit:s.twist[i]})),hasDeck:!!stack("twist",this.actor.id),
      handCards:canViewHand?hand.cards.map(card=>({id:card.id,name:card.name,img:card.faces[0]?.img})):[],
      handCount:canViewHand?hand.cards.size:0,overflow:canViewHand&&hand.cards.size>5,credits:canViewHand?(hand.getFlag(ID,"credits")??0):0,refresh:canViewHand&&hand.getFlag(ID,"refresh"),
      masterOnline:!!authority(),npcDefense:c.defense+s.rank,npcWillpower:c.willpower+s.rank,
      items:this.actor.items.map(item=>({id:item.id,name:item.name,description:item.system.description,quantity:item.system.quantity})),
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
  static table(){new FateTable().render({force:true});}
  static item(_event,target){this.actor.items.get(target.dataset.itemId)?.sheet.render({force:true});}
  static check(_event,target){return safely(async()=>{
    if(!this.isEditable)return;
    const kind=target.dataset.kind??"duel";
    if(kind==="initiative")return request({op:"duel",actorId:this.actor.id,actorUuid:this.actor.uuid,kind});
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
  static DEFAULT_OPTIONS={classes:["ttb"],position:{width:500,height:440},form:{submitOnChange:true}};
  static PARTS={body:{template:`systems/${ID}/templates/item.hbs`}};
  async _prepareContext(options){return {...await super._prepareContext(options),item:this.document,s:this.document.system};}
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
