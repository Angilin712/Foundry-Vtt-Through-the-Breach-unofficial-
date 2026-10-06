import {createCharacter,beginSession,endScene,endSession} from './creation-ui.mjs';
import {repairCreatedPursuit} from './creation.mjs';
import {ID} from "./rules.mjs";
import {BreachActorModel,BreachItemModel} from "./models.mjs";
import {BreachSheet,BreachItemSheet,FateTable,handleChat,safely} from "./ui.mjs";
import {request,processRequest,syncHand,enqueue,authority} from "./cards.mjs";
import {compareCombatants} from './battle.mjs';
import {turnLifecycle} from './turns.mjs';
const {Actor,Item,Combat}=foundry.documents;

class BreachCombat extends Combat {
  async _onStartTurn(combatant,context){await super._onStartTurn(combatant,context);return enqueue(()=>safely(()=>turnLifecycle(this,combatant,context,'start')));}
  async _onEndTurn(combatant,context){await super._onEndTurn(combatant,context);return enqueue(()=>safely(()=>turnLifecycle(this,combatant,context,'end')));}
  async rollInitiative(ids,options={}){
    for(const id of typeof ids==="string"?[ids]:(ids??this.combatants.filter(c=>c.initiative===null).map(c=>c.id))){
      const c=this.combatants.get(id);if(!c?.actor||!c.isOwner)continue;
      await request({op:"duel",actorId:c.actor.id,actorUuid:c.actor.uuid,kind:"initiative",combatId:this.id,combatantId:c.id});
    }
    return this;
  }
  _sortCombatants(a,b){return compareCombatants(a,b);}
}
Hooks.once("init",()=>{
  CONFIG.Actor.dataModels.fated=BreachActorModel;CONFIG.Actor.dataModels.npc=BreachActorModel;
  for(const t of ["equipment","talent","magic"])CONFIG.Item.dataModels[t]=BreachItemModel;
  CONFIG.Actor.typeLabels.fated="TYPES.Actor.fated";CONFIG.Actor.typeLabels.npc="TYPES.Actor.npc";
  Object.assign(CONFIG.Item.typeLabels,{equipment:"TYPES.Item.equipment",talent:"TYPES.Item.talent",magic:"TYPES.Item.magic"});
  CONFIG.Combat.documentClass=BreachCombat;
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor,ID,BreachSheet,{types:["fated","npc"],makeDefault:true,label:"Сквозь Пролом"});
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item,ID,BreachItemSheet,{types:["equipment","talent","magic"],makeDefault:true,label:"Сквозь Пролом"});
  game.settings.register(ID,"requests",{scope:"world",config:false,type:Object,default:{}});
  game.settings.registerMenu(ID,"table",{name:"Стол Судьбы",label:"Открыть Стол Судьбы",hint:"Подготовка колод, раздача и личные руки.",icon:"fas fa-cards",type:FateTable,restricted:false});
  game.settings.register(ID,"sessions",{scope:"world",config:false,type:Object,default:{}});
  game.ttb={createCharacter,beginSession,endScene,endSession,openTable:()=>new FateTable().render({force:true}),request};
});
Hooks.on("preCreateActor",(actor)=>{
  actor.updateSource({prototypeToken:{actorLink:actor.type==="fated",bar1:{attribute:"wounds"},displayName:20},...(actor.type==="npc"?{"system.characteristics":"Живой"}:{})});
});
Hooks.on("createChatMessage",message=>processRequest(message));
Hooks.once("ready",()=>{
  if(authority()?.id===game.user.id){
    game.messages.forEach(processRequest);
    for(const actor of game.actors)enqueue(async()=>{await repairCreatedPursuit(actor);await syncHand(actor);});
  }
  ui.notifications.info("Сквозь Пролом: откройте «Стол Судьбы» из листа персонажа или настроек системы.");
});
Hooks.on("updateUser",()=>{if(authority()?.id===game.user.id)game.messages.forEach(processRequest);});
Hooks.on("userConnected",()=>{if(authority()?.id===game.user.id)game.messages.forEach(processRequest);});
Hooks.on("updateActor",actor=>{if(authority()?.id===game.user.id)enqueue(()=>syncHand(actor));});
Hooks.on("renderChatMessageHTML",(message,html)=>{
  if(message.getFlag(ID,"status")==="done"&&message.getFlag(ID,"request")){const row=html.closest('.message')??html;row.classList.add('ttb-request-done');row.hidden=true;return;}
  const d=message.getFlag(ID,"duel");if(!d||!message.author?.isGM)return;
  const actor=d.actorUuid?fromUuidSync(d.actorUuid):game.actors.get(d.actorId);
  html.querySelectorAll("[data-ttb]").forEach(button=>{
    const gmOnly=['applyDamage','undoDamage','critical','consciousness','criticalConsciousness'].includes(button.dataset.ttb);
    const controller=button.dataset.ttb==='attackDamage'?fromUuidSync(d.attack.sourceUuid):actor;
    if(!controller?.isOwner||(gmOnly&&!game.user.isGM)){button.hidden=true;return;}
    button.addEventListener("click",event=>{event.preventDefault();button.disabled=true;safely(()=>handleChat(message,button.dataset.ttb,button)).finally(()=>{button.disabled=false;});});
  });
});
let renderTimer;
function refreshApps(){clearTimeout(renderTimer);renderTimer=setTimeout(()=>{
  for(const actor of game.actors)for(const app of Object.values(actor.apps))if(app.rendered)app.render({force:false});
  const table=foundry.applications.instances.get("ttb-fate-table");if(table?.rendered)table.render({force:false});
},100);}
for(const hook of ["createCards","updateCards","deleteCards","createCard","updateCard","deleteCard","createItem","updateItem","deleteItem"])Hooks.on(hook,refreshApps);
