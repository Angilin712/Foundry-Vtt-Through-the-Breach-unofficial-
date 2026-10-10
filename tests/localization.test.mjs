import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {reset,actor,ID} from './harness.mjs';
const {language,t,tr,documentName,localizedField,cardImage,canonicalJournalPage,rangeLabel}=await import('../through-the-breach/scripts/localization.mjs');
const {preserveTranslatedFields,localizedEditableFields}=await import('../through-the-breach/scripts/localization-ui.mjs');
const {SKILLS,ASPECTS,SUITS,makeFateDeck,cardName}=await import('../through-the-breach/scripts/rules.mjs');
const {duelHTML}=await import('../through-the-breach/scripts/cards.mjs');
const {compileSpell}=await import('../through-the-breach/scripts/spell-builder.mjs');
const load=async name=>JSON.parse(await readFile(`through-the-breach/${name}`,'utf8'));
const ru=await load('lang/ru.json'),en=await load('lang/en.json'),packs=await load('data/pack-sources.json');
function locale(lang){game.i18n={lang,localize:key=>foundry.utils.getProperty(lang==='en'?en:ru,key)??key};}
beforeEach(()=>{reset();locale('ru');});
test('All declared language keys have nonempty translations',()=>{
  assert.deepEqual(Object.keys(ru.TTB.Text).sort(),Object.keys(en.TTB.Text).sort());
  for(const [key,value]of Object.entries(en.TTB.Text))assert.ok(typeof value==='string'&&value.trim(),key);
});
test('Defense and numerical spell ranges use correct English labels',()=>{
  locale('en');assert.equal(t('Защита'),'Defense');assert.equal(rangeLabel('y1 ярд'),'y1 yard');assert.equal(rangeLabel('z10 ярдов'),'z10 yards');
  locale('ru');assert.equal(rangeLabel('y1 ярд'),'y1 ярд');
});
test('Adventure scenes and journals sharing a key have separate display identities',async()=>{
  locale('en');const data=await load('data/starter-adventure.json');
  for(const [group,kind,name]of [['journals','journal','04 — The Steam Engine'],['scenes','scene','03 — Steam Engine']]){
    const doc=structuredClone(data[group].find(x=>x.key==='engine').data);doc.flags={[ID]:{starter:{key:'engine',kind}}};assert.equal(documentName(doc),name);
  }
});
test('Skills, Aspects and suits follow current language after modules are loaded',()=>{
  assert.equal(SKILLS.sorcery.label,'Колдовство');locale('en');
  assert.equal(SKILLS.sorcery.label,'Sorcery');assert.equal(ASPECTS.might,'Might');assert.equal(SUITS.crows,'Crows');
  locale('ru');assert.equal(SKILLS.sorcery.label,'Колдовство');
});
test('Template localization preserves dynamic player text and HTML/form identifiers',()=>{
  locale('en');const userName='Колдовство';
  assert.equal(tr`<p>Навык: ${userName}</p>`,'<p>Skill: Колдовство</p>');
  assert.equal(t('<label>Навык<select name="system.skill"></select></label>'),'<label>Skill<select name="system.skill"></select></label>');
});
test('Immutable catalogue fields translate while renamed records and edited descriptions win',()=>{
  const record=structuredClone(packs.magic.find(i=>i.flags[ID].catalog.key==='magia-2'));const original=structuredClone(record);
  locale('en');assert.equal(documentName(record),'Heal');assert.notEqual(localizedField(record,'system.description'),record.system.description);
  assert.deepEqual(record,original);record.name='Моя магия';record.system.description+=' Моя заметка.';
  assert.equal(documentName(record),'Моя магия');assert.equal(localizedField(record,'system.description'),record.system.description);
});
test('Same Russian name translates by catalogue identity rather than breaking rule identity',()=>{
  locale('en');for(const[key,expected]of [['weapon-Миротворец','Peacebringer'],['pursuit-11-talent-406e3e72d4e5','Healing'],['magia-2','Heal']]){
    const doc=Object.values(packs).flat().find(i=>i.flags[ID].catalog?.key===key);assert.equal(documentName(doc),expected);
  }
});
test('Submitting another field preserves canonical values but retains actual player edits',()=>{
  locale('en');const doc=structuredClone(packs.magic.find(i=>i.flags[ID].catalog.key==='magia-2'));
  const displayed=localizedEditableFields(doc);
  const untouched=preserveTranslatedFields({name:displayed.name,system:{description:displayed['system.description'],quantity:2}},doc,displayed);
  assert.equal(untouched.name,doc.name);assert.equal(untouched.system.description,doc.system.description);assert.equal(untouched.system.quantity,2);
  const edited=preserveTranslatedFields({name:'My Spell'},doc,displayed);assert.equal(edited.name,'My Spell');
});
test('Every native Fate card has a locale-specific image without changing stored paths',async()=>{
  locale('en');for(const card of makeFateDeck()){
    const key=card.value===0?'black-joker':card.value===14?'red-joker':`${card.suit}-${card.value}`;
    const path=`systems/${ID}/assets/cards/${key}.svg`;const displayed=cardImage(path);
    assert.match(displayed,/\/cards\/en\//);await access(displayed.replace('systems/',''));assert.doesNotMatch(cardName(card),/[А-Яа-яЁё]/);
  }
});
test('One stored duel renders independently for Russian and English clients',()=>{
  const a=actor('Колдовство'),d={actorName:a.name,actorId:a.id,actorUuid:a.uuid,label:'Колдовство',skill:'sorcery',kind:'duel',npc:false,base:3,baseSuits:[],tn:10,required:[],mod:0,cards:[{id:'c',value:8,suit:'tomes',name:'8 · Томы',img:`systems/${ID}/assets/cards/tomes-8.svg`}],selected:0,closed:true,stage:'closed',track:[1,2,3]};
  const original=structuredClone(d);assert.match(duelHTML(d),/Колдовство · Колдовство/);locale('en');
  const html=duelHTML(d);assert.match(html,/Колдовство · Sorcery/);assert.match(html,/8 · Tomes/);assert.match(html,/cards\/en\/tomes-8/);assert.deepEqual(d,original);
});
test('Immuto calculations remain identical in both languages for catalogue components',()=>{
  const a=actor();for(const doc of packs.magic){const item=structuredClone(doc);item.id=item._id;item.system.quantity=1;item.system.equipped=true;item.system.grimoireId='';a.items.set(item.id,item);}
  const base=a.items.find(i=>i.flags[ID].catalog.key==='magia-2');
  const suit=a.items.find(i=>i.flags[ID].catalog.key==='immuto-Дополнительная Масть');
  const recipe={baseId:base.id,immutos:[{itemId:suit.id,count:1,suit:'tomes'}]};
  const russian=compileSpell(a,recipe);locale('en');const english=compileSpell(a,recipe);
  for(const key of ['tn','ap','required','resistance','skill','aspect'])assert.deepEqual(english[key],russian[key],key);
  assert.equal(english.required,'RT');assert.equal(english.tn,base.system.tn-3);
});
test('Adventure journal translations are disabled after a GM edits a page',async()=>{
  const data=await load('data/starter-adventure.json'),entry=data.journals[0],page=structuredClone(entry.data.pages[0]);
  page.parent={flags:{[ID]:{starter:{key:entry.key}}}};
  assert.equal(canonicalJournalPage(page),true);page.text.content+='<p>GM note</p>';assert.equal(canonicalJournalPage(page),false);
});
