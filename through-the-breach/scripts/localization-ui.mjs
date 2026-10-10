import {documentName,localizedField,text,t,language,canonicalJournalPage} from './localization.mjs';
const ID='through-the-breach';
const element=html=>html?.[0]??html;
export function renderLocalizedDirectory(app,html){
  const root=element(html);if(!root?.querySelectorAll)return;
  const isSystemPack=app.collection?.collection?.startsWith(`${ID}.`);
  if(isSystemPack){
    const title=root.querySelector('.window-title');if(title)title.textContent=text(app.collection.metadata.label);
    for(const label of root.querySelectorAll('.compendium-name strong,header strong.ellipsis'))label.textContent=text(app.collection.metadata.label);
  }
  for(const row of root.querySelectorAll('[data-entry-id]')){
    const doc=isSystemPack?app.collection.index?.get(row.dataset.entryId):app.collection?.get?.(row.dataset.entryId);
    const label=row.querySelector('.entry-name');if(!label||!doc)continue;
    // Only our immutable system packs use plain translated names. World documents use baselines.
    label.textContent=isSystemPack?(doc.name==='Миротворец'&&app.collection.collection.endsWith('.equipment')&&language()==='en'?'Peacebringer':text(doc.name)):documentName(doc);
  }
  for(const row of root.querySelectorAll('[data-folder-id]')){
    const folder=game.folders.get(row.dataset.folderId),flags=folder?.flags?.[ID];
    if(!flags?.bestiaryRoot&&!flags?.starter)continue;
    const label=row.querySelector('.folder-name');if(label)label.textContent=text(folder.name);
  }
  if(typeof app._matchSearchEntries==='function'&&!app._ttbLocalizedSearch){
    const original=app._matchSearchEntries.bind(app);app._ttbLocalizedSearch=true;
    app._matchSearchEntries=(query,entryIds,folderIds,autoExpandIds,options)=>{
      original(query,entryIds,folderIds,autoExpandIds,options);
      for(const row of app.element.querySelectorAll('[data-entry-id]')){
        if(row.hidden)continue;
        const name=row.querySelector('.entry-name')?.textContent??'';
        if(!query.test(foundry.applications.ux.SearchFilter.cleanQuery(name)))continue;
        entryIds.add(row.dataset.entryId);
        for(let folder=row.parentElement?.closest('[data-folder-id]');folder;folder=folder.parentElement?.closest('[data-folder-id]')){
          folderIds.add(folder.dataset.folderId);autoExpandIds.add(folder.dataset.folderId);
        }
      }
    };
  }
}
export function renderLocalizedPacks(_app,html){
  const root=element(html);if(!root?.querySelectorAll)return;
  for(const row of root.querySelectorAll('[data-pack]')){
    const pack=game.packs.get(row.dataset.pack);if(pack?.metadata?.system!==ID)continue;
    const label=row.querySelector('.compendium-name strong');if(label)label.textContent=text(pack.metadata.label);
  }
}
export function localizedEditableFields(doc){
  const fields={name:documentName(doc)};
  for(const field of ['description','reference','range','notes','characteristics'])fields['system.'+field]=localizedField(doc,'system.'+field);
  return fields;
}
export function preserveTranslatedFields(result,document,displayed){
  // Submitting another field must never save an automatic display translation as a player edit.
  for(const[path,value]of Object.entries(displayed??{})){
    if(foundry.utils.getProperty(result,path)===value)foundry.utils.setProperty(result,path,foundry.utils.getProperty(document,path));
  }
  return result;
}
export function renderLocalizedJournal(app,html){
  const root=element(html);if(!root?.querySelectorAll)return;
  const journal=app.document?.pages?app.document:app.document?.parent;
  if(!journal?.getFlag(ID,'starter'))return;
  if(Array.from(journal.pages).every(canonicalJournalPage)){
    for(const nav of root.querySelectorAll('nav')){
      const walker=document.createTreeWalker(nav,NodeFilter.SHOW_TEXT);let node;
      while((node=walker.nextNode()))node.nodeValue=text(node.nodeValue);
    }
  }
  for(const page of journal.pages){
    if(!canonicalJournalPage(page))continue;
    const section=root.querySelector(`[data-page-id="${page.id}"]`)??(app.document===page?root:null);if(!section)continue;
    for(const heading of section.querySelectorAll('.journal-page-header h1'))heading.textContent=text(heading.textContent);
    // Translate reading views only, never editor content or form values.
    for(const body of section.querySelectorAll('.journal-page-content,.journal-entry-page-content')){
      if(body.matches('prose-mirror')||body.closest('form')||body.querySelector('[contenteditable="true"],textarea'))continue;
      const walker=document.createTreeWalker(body,NodeFilter.SHOW_TEXT);let node;
      while((node=walker.nextNode()))node.nodeValue=text(node.nodeValue);
    }
  }
}
