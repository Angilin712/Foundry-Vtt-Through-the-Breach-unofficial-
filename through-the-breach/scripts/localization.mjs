// Localization is a presentation layer: canonical document data and rule identifiers stay unchanged.
import {SOURCE,NAMES,BASELINES} from './localization-data.mjs';
let source=new Map(Object.entries(SOURCE).map(([key,value])=>[value,key])),canonicalNames=new Map(Object.entries(NAMES)),baselines=BASELINES;
export const localizationKey=value=>source.has(String(value).trim())?`TTB.Text.${source.get(String(value).trim())}`:value;
export function fingerprint(value){let hash=2166136261;const s=String(value??'');for(let i=0;i<s.length;i++)hash=Math.imul(hash^s.charCodeAt(i),16777619);return (hash>>>0).toString(16).padStart(8,'0');}
export function setLocalizationSource(phrases){source=new Map(Object.entries(phrases).map(([key,value])=>[value,key]));}
export function language(){return String(globalThis.game?.i18n?.lang??'ru').split('-')[0]==='en'?'en':'ru';}
export function text(value){
  const str=String(value??'');if(language()!=='en')return str;
  const clean=str.trim(),key=source.get(clean);if(!key)return str;
  const translated=globalThis.game?.i18n?.localize(`TTB.Text.${key}`);
  return translated&&translated!==`TTB.Text.${key}`?str.replace(clean,translated):str;
}
// HTML syntax is never translated. Dynamic substitutions in tagged templates are kept verbatim.
export function t(value){
  return String(value??'').split(/(<[^>]*>)/g).map(part=>part.startsWith('<')?
    part.replace(/\b(title|placeholder|alt|aria-label)="([^"{}]*)"/g,(_m,attr,val)=>`${attr}="${text(val)}"`):text(part)).join('');
}
export function tr(parts,...values){return parts.map((part,i)=>t(part)+(i<values.length?String(values[i]??''):'')).join('');}
export function labels(object){return Object.fromEntries(Object.entries(object).map(([key,value])=>[key,text(value)]));}
export function liveLabels(object){return new Proxy(object,{get(target,key,receiver){const value=Reflect.get(target,key,receiver);return typeof value==='string'?text(value):value;}});}
export function localizedField(document,path){
  const original=path.split('.').reduce((obj,key)=>obj?.[key],document);
  const generated=document?.flags?.['through-the-breach']?.localization;
  if(generated?.canonical&&Object.hasOwn(generated.canonical,path)&&generated.canonical[path]===original)return language()==='en'?(generated.en?.[path]??t(original)):original;
  if(document?.flags?.['through-the-breach']?.catalog?.kind==='creationGrimoire'){
    if(path==='system.description'&&original==='Две Магии и три Иммуто, выбранные при создании. Настройка выполняется в листе.')return t(original);
    if(path==='name')for(const[key,name]of canonicalNames)if(/^pursuit-\d+$/.test(key)&&original===`Начальный гримуар · ${name}`)return t('Начальный гримуар · ')+t(name);
  }
  const id=documentIdentity(document);if(!id)return original;
  if(baselines[id]?.[path]!==fingerprint(original))return original;
  if(language()==='en'&&id==='weapon-Миротворец'&&path==='name')return 'Peacebringer';
  if(language()==='en'&&path==='name'){
    if(id==='pursuit-11-talent-406e3e72d4e5')return 'Healing';
    if(id==='pursuit-1-talent-57b6d0da392a')return 'Thugs';
    if(id.includes('/item/')&&original==='Защита')return 'Protect';
    if(id.includes('/item/')&&original==='Приманка')return 'Lure';
    if(id.includes('/item/')&&original==='Элементальный удар')return 'Elemental Bolt';
  }
  if(path==='name'){
    const baseline=canonicalNames.get(id);
    if(!baseline||original!==baseline)return original; // A user rename always wins.
  }
  if(path==='system.range')return rangeLabel(original);
  return t(original);
}
export function documentIdentity(document){
  const flags=document?.flags?.['through-the-breach'];
  if(flags?.starter?.kind&&baselines[flags.starter.kind+':'+flags.starter.key])return flags.starter.kind+':'+flags.starter.key;
  const key=flags?.catalog?.key??flags?.bestiary?.key??flags?.starter?.key;if(key)return key;
  const parentKey=document?.parent?.flags?.['through-the-breach']?.bestiary?.key??document?.parent?.flags?.['through-the-breach']?.starter?.key;
  if(!parentKey)return null;
  const prefix=parentKey+'/item/';
  return Object.keys(baselines).find(k=>k.startsWith(prefix)&&baselines[k].name===fingerprint(document.name))??null;
}
export function documentName(document){return localizedField(document,'name');}
export function rangeLabel(value){
  const str=String(value??'');if(language()!=='en')return str;
  return t(str.replace(/(\d+(?:\.\d+)?)\s+ярд(?:а|ов|ы)?(?=\s|$|[.,;])/gu,(_m,n)=>`${n} ${Number(n)===1?'yard':'yards'}`));
}
export function setCanonicalNames(entries){canonicalNames=new Map(Object.entries(entries));}
export function setDocumentBaselines(entries){baselines=entries;}
export function canonicalJournalPage(page){
  const key=page?.parent?.flags?.['through-the-breach']?.starter?.key;if(!key)return false;
  const id=Object.keys(baselines).find(k=>k.startsWith(key+'/page/')&&baselines[k].name===fingerprint(page.name));if(!id)return false;
  const content=String(page.text?.content??'').replace(/@UUID\[([^\]]+)\]\{[^}]*\}/g,(match,uuid)=>{
    const flags=globalThis.fromUuidSync?.(uuid)?.flags?.['through-the-breach']?.starter;
    return flags?`{ttb:${flags.kind}:${flags.key}}`:match;
  });
  return baselines[id]['text.content']===fingerprint(content);
}
export function registerLocalizationHelpers(handlebars){handlebars.registerHelper('ttbText',value=>text(value));}
export function initializeLocalization(){
  const handlebars=globalThis.Handlebars??globalThis.foundry?.applications?.handlebars?.Handlebars;
  if(handlebars)registerLocalizationHelpers(handlebars);
}
export function cardImage(path){return language()==='en'&&/^systems\/through-the-breach\/assets\/cards\/(?!en\/)[^/]+\.svg$/.test(path??'')?path.replace('/cards/','/cards/en/'):path;}
