import {ID,assert} from './rules.mjs';

export function missingBestiary(entries,actors){
  const keys=new Set(Array.from(actors,a=>a.getFlag(ID,'bestiary')?.key).filter(Boolean));
  return entries.filter(e=>!keys.has(e.key));
}

// Native documents only: never write a running world's database from disk.
// Existing catalogue actors, including GM edits, are intentionally preserved.
export async function importBestiary(){
  assert(game.user.isGM,'Бестиарий может устанавливать только мастер.');
  const response=await fetch(`systems/${ID}/data/bestiary.json`);
  assert(response.ok,'Не удалось загрузить каталог бестиария.');
  const catalogue=await response.json();
  assert(Array.isArray(catalogue.entries)&&catalogue.entries.length,'Каталог бестиария пуст.');
  if(game.macros&&!game.macros.some(m=>m.getFlag(ID,'bestiaryImport'))){
    await foundry.documents.Macro.create({name:'Бестиарий — добавить отсутствующих противников',type:'script',
      img:`systems/${ID}/assets/ui/story.svg`,ownership:{default:0},flags:{[ID]:{bestiaryImport:true}},
      command:'if (!game.user.isGM) return ui.notifications.warn("Бестиарий устанавливает мастер."); await game.ttb.importBestiary();'});
  }
  // Correct only the original Bayou reference; preserve all edited statistics and notes.
  for(const entry of catalogue.entries.filter(e=>e.sourceBook==='book-02')){
    const old=`${entry.book}, стр. ${entry.sourcePage-2} (PDF ${entry.sourcePage})`;
    const actor=game.actors.find(a=>a.getFlag(ID,'bestiary')?.key===entry.key);
    if(actor?.getFlag(ID,'bestiary')?.reference!==old)continue;
    const changes={[`flags.${ID}.bestiary.reference`]:entry.data.flags[ID].bestiary.reference};
    if(actor.system.notes.startsWith(old))changes['system.notes']=entry.data.flags[ID].bestiary.reference+actor.system.notes.slice(old.length);
    await actor.update(changes);
    const items=actor.items.filter(i=>i.system.reference===old).map(i=>({_id:i.id,'system.reference':entry.data.flags[ID].bestiary.reference}));
    if(items.length)await actor.updateEmbeddedDocuments('Item',items);
  }
  for(const entry of catalogue.entries.filter(e=>e.data.system.rankWounds)){
    const actor=game.actors.find(a=>a.getFlag(ID,'bestiary')?.key===entry.key);
    if(actor?.prototypeToken?.bar1?.attribute==='wounds'&&actor.prototypeToken.texture.src===entry.data.prototypeToken.texture.src)await actor.update({'prototypeToken.bar1.attribute':'rank'});
  }
  const pending=missingBestiary(catalogue.entries,game.actors);
  if(!pending.length){await game.settings.set(ID,'bestiaryVersion',catalogue.version);return {created:0,total:catalogue.entries.length};}
  const {Folder,Actor}=foundry.documents;
  let root=game.folders.find(f=>f.type==='Actor'&&f.getFlag(ID,'bestiaryRoot'))??game.folders.find(f=>f.type==='Actor'&&f.name==='Бестиарий'&&!f.folder);
  root??=await Folder.create({name:'Бестиарий',type:'Actor',sorting:'a',color:'#546e68',flags:{[ID]:{bestiaryRoot:true}}});
  const folders=new Map();
  for(const book of new Set(pending.map(e=>e.book))){
    const existing=game.folders.find(f=>f.type==='Actor'&&f.name===book&&f.folder?.id===root.id);
    const folder=existing??await Folder.create({name:book,type:'Actor',folder:root.id,sorting:'a'});
    folders.set(book,folder.id);
  }
  ui.notifications.info(`Бестиарий: добавляю ${pending.length} противников. Это может занять немного времени.`);
  let created=0;
  for(let start=0;start<pending.length;start+=20){
    const batch=pending.slice(start,start+20).map(e=>({...foundry.utils.deepClone(e.data),folder:folders.get(e.book)}));
    const documents=await Actor.createDocuments(batch);
    created+=documents.length;
  }
  await game.settings.set(ID,'bestiaryVersion',catalogue.version);
  ui.notifications.info(`Бестиарий готов: добавлено ${created} противников. Папка доступна мастеру в разделе «Актёры».`);
  return {created,total:catalogue.entries.length};
}
