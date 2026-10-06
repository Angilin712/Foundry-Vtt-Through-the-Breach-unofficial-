import {ID} from "./rules.mjs";
import {BreachActorModel,BreachItemModel} from "./models.mjs";
import {BreachSheet,BreachItemSheet,FateTable,handleChat,safely} from "./ui.mjs";
import {request,processRequest,syncHand,enqueue,authority} from "./cards.mjs";
const {Actor,Item,Combat}=foundry.documents;

class BreachCombat extends Combat {
  async rollInitiative(ids,options={}){
    for(const id of typeof ids==="string"?[ids]:ids){
      const c=this.combatants.get(id);if(!c?.actor||!c.isOwner)continue;
      await request({op:"duel",actorId:c.actor.id,actorUuid:c.actor.uuid,kind:"initiative",combatId:this.id,combatantId:c.id});
    }
    return this;
  }
  _sortCombatants(a,b){
    const initiative=(b.initiative??-Infinity)-(a.initiative??-Infinity);
    if(initiative&&!Number.isNaN(initiative))return initiative;
    const fated=Number(b.actor?.type==="fated")-Number(a.actor?.type==="fated");
    if(fated)return fated;
    return (b.actor?.system.aspects.speed??0)-(a.actor?.system.aspects.speed??0)||a.name.localeCompare(b.name,"ru");
  }
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
  game.ttb={openTable:()=>new FateTable().render({force:true}),request};
});
Hooks.on("preCreateActor",(actor)=>{
  actor.updateSource({prototypeToken:{actorLink:actor.type==="fated",bar1:{attribute:"wounds"},displayName:20},...(actor.type==="npc"?{"system.characteristics":"Живой"}:{})});
});
Hooks.on("createChatMessage",message=>processRequest(message));
Hooks.once("ready",()=>{
  if(authority()?.id===game.user.id){
    game.messages.forEach(processRequest);
    for(const actor of game.actors)enqueue(()=>syncHand(actor));
  }
  ui.notifications.info("Сквозь Пролом: откройте «Стол Судьбы» из листа персонажа или настроек системы.");
});
Hooks.on("updateUser",()=>{if(authority()?.id===game.user.id)game.messages.forEach(processRequest);});
Hooks.on("userConnected",()=>{if(authority()?.id===game.user.id)game.messages.forEach(processRequest);});
Hooks.on("updateActor",actor=>{if(authority()?.id===game.user.id)enqueue(()=>syncHand(actor));});
Hooks.on("renderChatMessageHTML",(message,html)=>{
  if(message.getFlag(ID,"status")==="done"&&message.getFlag(ID,"request")){html.hidden=true;return;}
  const d=message.getFlag(ID,"duel");if(!d||!message.author?.isGM)return;
  const actor=d.actorUuid?fromUuidSync(d.actorUuid):game.actors.get(d.actorId);
  html.querySelectorAll("[data-ttb]").forEach(button=>{
    if(!actor?.isOwner){button.hidden=true;return;}
    button.addEventListener("click",event=>{event.preventDefault();button.disabled=true;safely(()=>handleChat(message,button.dataset.ttb,button)).finally(()=>{button.disabled=false;});});
  });
});
let renderTimer;
function refreshApps(){clearTimeout(renderTimer);renderTimer=setTimeout(()=>{
  for(const actor of game.actors)for(const app of Object.values(actor.apps))if(app.rendered)app.render({force:false});
  const table=foundry.applications.instances.get("ttb-fate-table");if(table?.rendered)table.render({force:false});
},100);}
for(const hook of ["createCards","updateCards","deleteCards","createCard","updateCard","deleteCard"])Hooks.on(hook,refreshApps);
