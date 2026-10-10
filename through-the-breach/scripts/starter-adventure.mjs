import {t as ttbT,tr as ttbTr} from './localization.mjs';
import {ID,assert} from './rules.mjs';
export const STARTER='chapter11-iron-ram';
const tagged=(collection,kind,key)=>collection.find(d=>d.getFlag(ID,'starter')?.adventure===STARTER&&d.getFlag(ID,'starter')?.kind===kind&&d.getFlag(ID,'starter')?.key===key);
const flags=(kind,key)=>({[ID]:{starter:{adventure:STARTER,kind,key}}});
export async function starterMacros(){
  if(!game.user.isGM)return;
  let folder=tagged(game.folders,'folder','Macro');folder??=await foundry.documents.Folder.create({name:'11 — Фигня случается',type:'Macro',sorting:'m',color:'#426f70',flags:flags('folder','Macro')});
  const definitions=[
    ['import','Приключение 11 — установить материалы','await game.ttb.importStarterAdventure();'],
    ['encounter','Приключение 11 — расставить марионеток',`const count=await foundry.applications.api.DialogV2.prompt({window:{title:game.ttb.t("Марионетки — по одной на Сужденного")},content:game.ttb.t('<p>Укажите число участвующих Сужденных. Жетоны игроков разместите самостоятельно. Повтор не добавит второй набор противников.</p><label>Число марионеток<input type="number" name="count" min="1" max="20" value="4"></label>'),ok:{label:game.ttb.t("Расставить"),callback:(_event,button)=>Number(button.form.elements.count.value)},rejectClose:false}); if(count)await game.ttb.prepareStarterEncounter(count);`],
    ['guide','Приключение 11 — журнал мастера',ttbTr`const j=game.journal.find(j=>j.getFlag("${ID}","starter")?.key==="guide"); if(j)j.sheet.render({force:true});else ui.notifications.warn("Сначала установите материалы приключения.");`]
  ];
  for(const [key,name,command]of definitions)if(!tagged(game.macros,'macro',key))await foundry.documents.Macro.create({name,type:'script',folder:folder.id,command:ttbTr`if (!game.user.isGM) return ui.notifications.warn("Эта кнопка предназначена мастеру."); ${command}`,img:`systems/${ID}/assets/ui/story.svg`,ownership:{default:0},flags:flags('macro',key)});
}
// Use native document APIs. Import adds missing documents and never resets GM edits.
export async function importStarterAdventure(){
  assert(game.user.isGM,ttbT('Приключение устанавливает мастер.'));
  const response=await fetch(`systems/${ID}/data/starter-adventure.json`);assert(response.ok,ttbT('Материалы приключения не найдены.'));const data=await response.json();
  assert(data.id===STARTER&&Array.isArray(data.actors)&&Array.isArray(data.journals)&&Array.isArray(data.scenes),ttbT('Неверный каталог приключения.'));
  const folderMap=new Map(),documents=new Map();let added=0;
  for(const [type,children]of Object.entries(data.folders)){
    let root=tagged(game.folders,'folder',type);
    root??=await foundry.documents.Folder.create({name:data.name,type,sorting:'m',color:'#426f70',flags:flags('folder',type)});
    folderMap.set(type,root.id);
    for(const child of children){const key=`${type}/${child.key}`;let f=tagged(game.folders,'folder',key);f??=await foundry.documents.Folder.create({name:child.name,type,folder:root.id,sorting:'m',flags:flags('folder',key)});folderMap.set(key,f.id);}
  }
  for(const entry of data.actors){let doc=tagged(game.actors,'actor',entry.key);if(!doc){doc=await foundry.documents.Actor.create({...foundry.utils.deepClone(entry.data),folder:folderMap.get(`Actor/${entry.folder}`),flags:flags('actor',entry.key)});added++;}documents.set(`actor:${entry.key}`,doc);}
  // Create journals before scenes so scene notes can refer to stable real document IDs.
  for(const entry of data.journals){let doc=tagged(game.journal,'journal',entry.key);if(!doc){doc=await foundry.documents.JournalEntry.create({...foundry.utils.deepClone(entry.data),folder:folderMap.get(`JournalEntry/${entry.folder}`),flags:flags('journal',entry.key)});added++;}documents.set(`journal:${entry.key}`,doc);}
  for(const entry of data.scenes){let doc=tagged(game.scenes,'scene',entry.key);if(!doc){
    const source=foundry.utils.deepClone(entry.data),journal=documents.get(`journal:${entry.journal}`);source.journal=journal.id;
    source.tokens=(entry.tokens??[]).map(t=>{const actor=documents.get(`actor:${t.actor}`);return {...foundry.utils.deepClone(actor.prototypeToken.toObject()),...t.data,actorId:actor.id,actorLink:false,flags:flags('token',t.actor)};});
    doc=await foundry.documents.Scene.create({...source,folder:folderMap.get(`Scene/${entry.folder}`),flags:{...source.flags,[ID]:{...source.flags?.[ID],...flags('scene',entry.key)[ID]}}});added++;
  }documents.set(`scene:${entry.key}`,doc);}
  // Enrich only new, unresolved content; later GM text edits are left intact.
  for(const entry of data.journals){const doc=documents.get(`journal:${entry.key}`);for(const page of doc.pages){const content=page.text?.content;if(!content?.includes('{ttb:'))continue;const resolved=content.replace(/\{ttb:(actor|scene|journal):([\w-]+)\}/g,(_match,kind,key)=>{const target=documents.get(`${kind}:${key}`);assert(target,ttbT('Связанный материал не найден.'));return `@UUID[${target.uuid}]{${target.name}}`;});await page.update({'text.content':resolved});}}
  await starterMacros();ui.notifications.info(ttbTr`«${data.name}»: добавлено ${added} документов. Папки созданы в Актёрах, Сценах и Журналах.`);return {added};
}
export async function prepareStarterEncounter(count){
  assert(game.user.isGM,ttbT('Марионеток расставляет мастер.'));assert(Number.isInteger(count)&&count>=1&&count<=20,ttbT('Укажите от 1 до 20 Сужденных.'));
  const scene=tagged(game.scenes,'scene','train'),actor=tagged(game.actors,'actor','marionette');assert(scene&&actor,ttbT('Сначала установите приключение.'));
  assert(!scene.tokens.some(t=>t.getFlag(ID,'starter')?.key==='marionette'),ttbT('Марионетки уже размещены; проверьте существующие жетоны.'));
  const p=scene.getFlag(ID,'starterPositions')??{x:scene.width/2,y:scene.height/2};
  const tokens=Array.from({length:count},(_,i)=>({...actor.prototypeToken.toObject(),actorId:actor.id,actorLink:false,name:`Марионетка ${i+1}`,x:p.x+(i%5)*scene.grid.size,y:p.y+Math.floor(i/5)*scene.grid.size,hidden:true,disposition:-1,flags:flags('token','marionette')}));
  await scene.createEmbeddedDocuments('Token',tokens);ui.notifications.info(ttbTr`${count} марионеток размещены скрытыми. Откройте боевую сцену и покажите их при выходе из чемодана.`);return tokens.length;
}
