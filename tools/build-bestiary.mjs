import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ASPECTS,SKILLS,derived} from '../through-the-breach/scripts/rules.mjs';
import {FACTIONS,factionFor,tokenFrame} from '../through-the-breach/scripts/bestiary-factions.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const system=path.join(root,'through-the-breach');
const input=JSON.parse(fs.readFileSync(path.join(root,'research/bestiary/catalogue-prepared.json'),'utf8'));
const norm=s=>s.toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]/g,'');
const aliases=new Map(Object.values(SKILLS).flatMap(k=>[[norm(k.id),k.id],[norm(k.label),k.id]]));
for(const [name,id] of Object.entries({'Heavy Melee':'heavyMelee','Heavy Guns':'heavyGuns','Long Arms':'longArms','Thrown Weapons':'thrown','Thrown Weapon':'thrown','Counter-Spelling':'counterspelling','Pistols':'pistol','Pneumatics':'pneumatic','Гибкое':'flexible','Тяжелое рукопашное':'heavyMelee','Длинноствольное':'longArms','Пистолет':'pistol','Дробовик':'shotgun','Луки':'archery','ББ':'melee'}))aliases.set(norm(name),id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paragraph=s=>String(s);
fs.mkdirSync(path.join(system,'assets/bestiary/tokens'),{recursive:true});
const catalogue=[];
for(const row of input){
  const faction=factionFor(row);
  // Neverborn supplement profiles retain their faction even when they are Undead.
  const frameFaction=row.book==='book-09'?'neverborn':faction;
  const profileSkills=Object.fromEntries(Object.values(SKILLS).map(k=>[k.id,{rank:0,aspect:k.aspect,suits:'',trigger:'',...row.skills[k.id]}]));
  if(row.name==='Homunculus')for(const k of Object.keys(profileSkills))profileSkills[k].rank=1;
  if(row.name==='Klaus Norwood')for(const k of Object.keys(profileSkills))profileSkills[k].rank=SKILLS[k].group==='magic'?0:3;
  if(row.name==='Экзорцист'){profileSkills.melee.rank=3;profileSkills.notice={rank:2,suits:'C',aspect:'cunning',trigger:''};}
  const s={aspects:row.aspects,skills:profileSkills,temporaryAspects:Object.fromEntries(Object.keys(ASPECTS).map(k=>[k,0])),
    bonuses:Object.fromEntries(['defense','willpower','wounds','initiative','walk','charge'].map(k=>[k,0])),armor:row.stats.armor,
    walkRoundUp:true,autoArmor:false,allowShortCharge:true,canCharge:row.stats.charge!==0,rank:row.rank,rankWounds:!!row.rankWounds,rankDefense:row.rankDefense!==false,immuneWillpower:!!row.immuneWillpower,immunePulse:!!row.immunePulse,swarmAreaReduction:row.swarmAreaReduction??0};
  const base=derived(s);
  for(const k of Object.keys(s.bonuses))s.bonuses[k]=row.stats[k]-base[k];
  s.bonuses.charge=row.stats.charge-4-row.aspects.speed;
  const records=[];
  const actions=[...row.raw.matchAll(/^\(?([0-5])\)\s*([^\n]+)\n/gm)];
  for(let i=0;i<actions.length;i++){
    const a=actions[i],block=row.raw.slice(a.index,actions[i+1]?.index??row.raw.length);
    const av=block.match(/(?:AV|СН):\s*(\d+)(?:\+X)?\s*([rctmRCTM]*)/i);
    const damage=block.match(/(?:suffers|получает|наносит)\s+(\d+)\/(\d+)\/(\d+)\s+(?:damage|урон|поврежд)/i);
    const skillSpec=a[2].match(/\(([^()]+)\)\s*$/)?.[1]??'';
    const [skillName,aspectName]=skillSpec.split('/');
    const skill=aliases.get(norm(skillName));
    const aspect=Object.entries(ASPECTS).find(([k,label])=>norm(k)===norm(aspectName??'')||norm(label)===norm(aspectName??''))?.[0]??SKILLS[skill]?.aspect;
    const isWeapon=!!(av&&damage&&skill&&!/(?:TN|СЛ):/i.test(block.split('\n').slice(0,3).join('\n')));
    const weapon={};
    if(isWeapon){
      Object.assign(weapon,{isWeapon:true,skill,attackAspect:aspect,attackBonus:Number(av[1])-profileSkills[skill].rank-row.aspects[aspect],
        damage:damage.slice(1,4).join('/'),range:block.match(/(?:Rg|Дл):\s*([^=\n]+?)(?=\s*(?:=|Resist|Соп|$))/i)?.[1]?.trim()??'По описанию',
        defense:/(?:Resist|Соп):\s*(?:Wp|Св)/i.test(block)?'willpower':'defense',apCost:Number(a[1]),
        capacity:Number(block.match(/(?:Capacity|Ёмкость|Емкость)\s*(\d+)/i)?.[1]??0),
        reloadCost:Number(block.match(/(?:Reload|Перезарядка)\s*(\d+)/i)?.[1]??1),
        ignoreArmor:/ignores (?:the target'?s )?Armor|игнорирует броню/i.test(block)});
      weapon.loaded=weapon.capacity;
    }
    records.push({name:a[2].replace(/\s*\([^()]+\)\s*$/,'').trim(),type:isWeapon?'equipment':'talent',
      img:`systems/through-the-breach/${row.portrait||'assets/ui/records.svg'}`,
      system:{description:paragraph(block),reference:row.reference,category:isWeapon?'npc-attack':'npc-action',...weapon}});
  }
  records.unshift({name:'Особенности и полный профиль',type:'talent',img:`systems/through-the-breach/${row.portrait||'assets/ui/story.svg'}`,
    system:{category:'npc-profile',reference:row.reference,description:paragraph(row.raw)}});
  let portrait=row.portrait;
  // Missing portraits are explicit placeholders; they are never represented as book art.
  if(!portrait){
    portrait='assets/bestiary/portraits/placeholder.png';
    if(!fs.existsSync(path.join(system,portrait)))throw new Error('Prepare placeholder.png before building the catalogue.');
  }
  const bytes=fs.readFileSync(path.join(system,portrait));
  const mime=portrait.endsWith('.webp')?'webp':portrait.endsWith('.jpg')?'jpeg':'png';
  const token=`assets/bestiary/tokens/${row.key}.svg`;
  fs.writeFileSync(path.join(system,token),tokenFrame({portrait:`data:image/${mime};base64,${bytes.toString('base64')}`,faction:frameFaction}));
  const notes=[row.reference,`Фракция рамки: ${FACTIONS[frameFaction].label}.`,row.artSource,
    'Триггеры, ауры, сопротивления, слабости, призыв и другие особые способности мастер разрешает по описанию. Автоматические атаки охватывают только обычный числовой урон.',
    row.setup,row.sourceCorrection].filter(Boolean).join('\n\n');
  catalogue.push({key:row.key,book:row.bookLabel,sourceBook:row.book,sourcePage:row.page,
    expected:row.stats,data:{name:row.name,type:'npc',img:`systems/through-the-breach/${portrait}`,ownership:{default:0},
      flags:{'through-the-breach':{bestiary:{key:row.key,reference:row.reference,faction:frameFaction,manualRules:true,artGeneric:!!row.artGeneric,portraitPending:!row.portrait}}},
      system:{...s,rank:row.rank,height:row.stats.height,wounds:{value:row.stats.wounds},scrip:0,living:/\bLiving\b|Живо[йе]/i.test(row.tags),
        characteristics:row.tags.replace(/^\),\s*/,''),notes},items:records,
      prototypeToken:{actorLink:false,texture:{src:`systems/through-the-breach/${token}`},width:1,height:1,bar1:{attribute:row.rankWounds?'rank':'wounds'},displayName:20}}});
}
fs.mkdirSync(path.join(system,'data'),{recursive:true});
fs.writeFileSync(path.join(system,'data/bestiary.json'),JSON.stringify({version:4,edition:2,entries:catalogue},null,2)+'\n');
console.log(`Prepared ${catalogue.length} NPC templates, including ${catalogue.filter(x=>x.data.flags['through-the-breach'].bestiary.portraitPending).length} pending portraits.`);

