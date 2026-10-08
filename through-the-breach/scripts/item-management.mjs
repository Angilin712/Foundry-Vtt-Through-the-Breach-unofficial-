import {assert} from './rules.mjs';

export async function removeRecord(actor,itemId){
 assert(actor.isOwner,'Удалять записи может только владелец персонажа или мастер.');
 const item=actor.items.get(itemId);assert(item,'Запись уже удалена.');
 await actor.deleteEmbeddedDocuments('Item',[itemId]);
 const patch={};
 if(actor.system.activeGrimoire===itemId)patch['system.activeGrimoire']='';
 if(actor.system.currentPursuitId===itemId)patch['system.currentPursuitId']='';
 if(actor.system.pursuitProgress.some(x=>x.id===itemId))patch['system.pursuitProgress']=actor.system.pursuitProgress.filter(x=>x.id!==itemId);
 // Keep grimoireId on dependent spells: a missing grimoire must not make them unrestricted.
 if(Object.keys(patch).length)await actor.update(patch);
}
