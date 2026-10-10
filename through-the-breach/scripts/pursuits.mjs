import {t as ttbT,tr as ttbTr} from './localization.mjs';
import {ID,SKILLS,assert,outcome,escapeHTML as e} from './rules.mjs';
import {catalogDocuments,catalogMeta} from './creation.mjs';
import {actorFor,drawHand,saveDuel,stack} from './cards.mjs';

let tables;
export const normalizeTalent=s=>String(s??'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]/gu,'');
export async function pursuitTables(){return tables??=await fetch(`systems/${ID}/data/pursuit-progression.json`).then(r=>{assert(r.ok,ttbT('Таблицы Стремлений не загружены.'));return r.json();});}
export function pursuitRule(item,data){const key=catalogMeta(item).key;return data.pursuits.find(p=>p.key===key||!key&&normalizeTalent(p.name)===normalizeTalent(item?.name));}
export async function adoptPursuit(actor,id){
  if(!id)return actor.update({'system.currentPursuitId':''});
  const item=actor.items.get(id);assert(item?.type==='talent'&&item.system.category==='pursuit',ttbT('Выберите Стремление из листа.'));
  const rule=pursuitRule(item,await pursuitTables());
  if(!rule)return actor.update({'system.currentPursuitId':id});
  const progress=actor.system.pursuitProgress.map(x=>({...x})),row=progress.find(x=>x.id===id);
  const step0=(await catalogDocuments('talents')).find(i=>catalogMeta(i).kind==='step0'&&catalogMeta(i).pursuit===rule.key);assert(step0,ttbT('В библиотеке нет таланта шага 0.'));
  const token=`adopt:${id}`,existing=actor.items.some(i=>catalogMeta(i).kind==='step0'&&catalogMeta(i).pursuit===rule.key||i.getFlag?.(ID,'pursuitReward')?.token===token);
  await actor.update({'system.operationPending':ttbTr`Выбор Стремления: ${item.name}`});
  if(!existing&&(!row||row.step===0)){const d=step0.toObject();for(const k of ['_id','folder','ownership','_stats'])delete d[k];d.flags??={};d.flags[ID]??={};d.flags[ID].pursuitReward={token,step:0};await actor.createEmbeddedDocuments('Item',[d]);}
  if(!row)progress.push({id,step:0});
  return actor.update({'system.currentPursuitId':id,'system.pursuitProgress':progress,'system.operationPending':''});
}
export async function rewardChoices(actor,ep){
  assert(ep?.rewardStep>0&&!ep.rewardChosen,ttbT('Нет невыбранного таланта шага.'));
  const rule=pursuitRule(actor.items.get(ep.pursuitId),await pursuitTables());
  const row=rule?.progression.find(r=>r.step===ep.rewardStep);assert(row,ttbT('Для этого Стремления нет проверенной таблицы: выбор оформляет мастер.'));
  const docs=await catalogDocuments('talents');
  return docs.filter(i=>row.general&&catalogMeta(i).kind==='general'||catalogMeta(i).pursuit===rule.key&&row.options.some(n=>normalizeTalent(n)===normalizeTalent(i.name)));
}
export async function chooseReward(actor,p){
  const ep=actor.system.epilogues.find(x=>x.id===p.epilogueId),options=await rewardChoices(actor,ep),item=options.find(i=>i.uuid===p.talentUuid);
  assert(item,ttbT('Талант отсутствует в вариантах этого шага.'));assert(p.confirmed===true,ttbT('Проверьте требования и условия выбранного таланта.'));
  const token=`${ep.id}:${ep.pursuitId}:${ep.rewardStep}`;
  assert(!actor.items.some(i=>i.getFlag(ID,'pursuitReward')?.token===token),ttbT('Талант уже выдан: мастер должен сверить запись эпилога, повторная выдача запрещена.'));
  const name=normalizeTalent(item.name),kind=name==='освоенныйиммуто'?'immuto':name==='освоеннаямагия'?'magia':null;
  let component;
  if(kind){component=(await catalogDocuments('magic')).find(i=>i.uuid===p.componentUuid&&catalogMeta(i).kind===kind);assert(component,ttbT('Выберите осваиваемую Магию или Иммуто из библиотеки.'));assert(!actor.items.some(i=>i.getFlag(ID,'masteredComponent')===catalogMeta(component).key),ttbT('Этот компонент уже освоен.'));}
  await actor.update({'system.operationPending':ttbTr`Талант шага ${ep.rewardStep}: ${item.name}`});
  const record=i=>{const d=i.toObject();for(const k of ['_id','folder','ownership','_stats'])delete d[k];return d;};
  const talent=record(item);talent.flags??={};talent.flags[ID]??={};talent.flags[ID].pursuitReward={token,step:ep.rewardStep,component:component?.name??''};
  if(component)talent.name+=`: ${component.name}`;
  if(name==='чародейство')Object.assign(talent.system,{bonusTarget:'skill.sorcery',bonusSuits:'T'});
  const records=[talent];
  if(component){const d=record(component);Object.assign(d.system,{grimoireId:'',equipped:true});d.flags??={};d.flags[ID]??={};d.flags[ID].masteredComponent=catalogMeta(component).key;d.flags[ID].pursuitReward={token,component:true};records.push(d);}
  await actor.createEmbeddedDocuments('Item',records);
  await actor.update({'system.epilogues':actor.system.epilogues.map(x=>({...x,rewardChosen:x.id===ep.id?talent.name:x.rewardChosen})),'system.operationPending':''});
}

export function duelFailed(d,other){
  if(!d.closed||d.stage==='cancelled'||d.kind!=='duel')return false;
  const r=outcome(d);if(!r)return false;
  if(!d.opposed)return !r.success;
  if(!other?.closed||other.stage==='cancelled')return false;
  if(d.opposed.role==='attack')return d.spellTN!=null&&!r.success||r.total<outcome(other).total;
  if(other.spellTN!=null&&!outcome(other).success)return false;
  return r.total<=outcome(other).total;
}
export function qualifiesForBonus(rule,d,other){
  return !!rule&&duelFailed(d,other)&&(!rule.drawRequiresDramatic||d.dramatic)&&
    (rule.drawSkill?d.skill===rule.drawSkill:SKILLS[d.skill]?.group===rule.group);
}
export function bonusHTML(d){
  const b=d.pursuitBonus;if(!b)return '';
  return ttbTr`<p>Способность Стремления «${e(b.name)}»: ${b.status==='offered'?ttbT('можно взять одну Смешанную карту'):b.status==='taken'?ttbT('карта взята'):b.status==='declined'?ttbT('добор отклонён'):ttbT('добор прерван — мастер сверяет руку')}</p>${b.status==='offered'?ttbT('<button type="button" data-ttb="pursuitDraw">Взять карту Стремления</button><button type="button" data-ttb="pursuitDecline">Отказаться</button>'):''}`;
}
export function snapshotPursuit(actor){
  const owner=actor.type==='npc'&&actor.system.controllerUuid?fromUuidSync(actor.system.controllerUuid):actor;
  const item=owner?.items.get(owner.system.currentPursuitId);
  return item?{key:catalogMeta(item).key,name:item.name,actorUuid:owner.uuid,subordinate:owner.uuid!==actor.uuid,subordinateConstruct:owner.uuid!==actor.uuid&&/конструкт|construct/i.test(actor.system.characteristics)}:null;
}
export async function offerPursuitBonus(message,d){
  if(d.pursuitBonus||!d.pursuitSnapshot)return;
  const snap=d.pursuitSnapshot,rule=(await pursuitTables()).pursuits.find(p=>p.key===snap.key||!snap.key&&normalizeTalent(p.name)===normalizeTalent(snap.name));
  if(!rule||!qualifiesForBonus(rule,d,game.messages.get(d.opposed?.otherId)?.getFlag(ID,'duel')))return;
  if(rule.drawActor==='self'&&(snap.subordinate||d.npc))return;
  if(rule.drawActor!=='self'&&!snap.subordinateConstruct)return;
  const a=fromUuidSync(snap.actorUuid);if(a?.type!=='fated'||!stack('hand',a.id))return;
  d.pursuitBonus={name:rule.name,actorUuid:a.uuid,status:'offered'};await saveDuel(message,d);
}
export async function executePursuitBonus(user,p){
  const m=game.messages.get(p.messageId),d=foundry.utils.deepClone(m?.getFlag(ID,'duel')),b=d?.pursuitBonus;
  if(p.op==='pursuitRecover'){assert(user.isGM&&m?.author?.isGM&&b?.status==='pending',ttbT('Нет прерванного добора.'));assert(['taken','declined'].includes(p.resolution),ttbT('Сверьте руку и укажите итог.'));b.status=p.resolution;return saveDuel(m,d);}
  assert(m?.author?.isGM&&b?.status==='offered',ttbT('Нет доступного добора за эту проверку.'));
  const a=actorFor(user,null,b.actorUuid);assert(!a.system.operationPending,ttbT('Сначала восстановите прерванную операцию персонажа.'));
  if(p.op==='pursuitDecline'){b.status='declined';return saveDuel(m,d);}
  assert(p.op==='pursuitDraw',ttbT('Неизвестный выбор.'));const h=stack('hand',a.id);assert(h?.cards.size<=5,ttbT('Сначала сбросьте лишние карты из руки.'));
  b.status='pending';await saveDuel(m,d);await drawHand(a,1);b.status='taken';return saveDuel(m,d);
}
