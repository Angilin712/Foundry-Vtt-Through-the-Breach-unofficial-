import {ID,SKILLS,ASPECTS,assert,integer,outcome,escapeHTML as e} from './rules.mjs';
import {actorFor,startDuel,duelPlan,saveDuel} from './cards.mjs';

export const TASK_OPS=['taskCreate','taskContribute','taskNext','taskClose','taskRecover'];
export function ongoingPlan(d){
  const r=outcome(d);assert(r&&d.closed&&d.stage!=='cancelled','Сначала завершите проверку.');
  return {successes:r.success?1+r.successDegrees:0,failures:r.failureDegrees};
}
export function taskHTML(t){
  return `<section class="ttb-chat ttb-task"><header>${e(t.name)}</header><p>Текущее Соревнование · СЛ ${t.tn} · ${e(ASPECTS[t.aspect])}</p><p>${t.skills.map(k=>e(SKILLS[k].label)).join(', ')} · интервал ${t.interval} (${e(t.duration)})</p><p><b>Успехи ${t.successes}/${t.goal}</b> · Пределы Провала ${t.failures}/${t.limit}</p><p>${t.status==='success'?'Задача выполнена':t.status==='failure'?'Катастрофическое поражение':t.status==='closed'?'Задача закрыта мастером':'Задача открыта'}</p>${t.participants.map(a=>{const row=t.rows.find(r=>r.actorUuid===a.uuid&&r.interval===t.interval);return `<p>${e(a.name)}: ${row?(row.pending?'проверка начата — завершите в чате':row.cancelled?'отменено — требуется решение мастера':`+${row.successes} успехов, +${row.failures} Пределы Провала`):'вклад не сделан'}</p>`;}).join('')}<p>Успех: 1 + полные запасы по 5. Провал: полные недостатки по 5. Один вклад участника за интервал.</p></section>`;
}
async function saveTask(m,t){await m.update({[`flags.${ID}.ongoing`]:t,content:taskHTML(t)});}
function getTask(id){const m=game.messages.get(id),t=foundry.utils.deepClone(m?.getFlag(ID,'ongoing'));assert(m?.author?.isGM&&t,'Задача не найдена.');return {m,t};}
export async function recordContribution(message,d){
  if(!d.ongoing)return;
  const {m,t}=getTask(d.ongoing.messageId),row=t.rows.find(r=>r.messageId===message.id);
  assert(row&&row.interval===d.ongoing.interval&&row.actorUuid===d.actorUuid,'Проверка не зарегистрирована в этом интервале задачи.');if(!row.pending)return;
  if(d.stage==='cancelled'){row.cancelled=true;row.pending=false;}else{Object.assign(row,ongoingPlan(d),{pending:false});t.successes+=row.successes;t.failures+=row.failures;}
  t.status=t.failures>=t.limit?'failure':t.successes>=t.goal?'success':t.status;
  await saveTask(m,t);
}
export async function executeOngoing(user,p){
  if(p.op==='taskCreate'){
    assert(user.isGM,'Задачу создаёт мастер.');
    const name=String(p.name??'').trim(),duration=String(p.duration??'5 минут').trim();assert(name&&name.length<=120&&duration.length<=120,'Введите название и длительность.');
    assert(Array.isArray(p.skills)&&p.skills.length&&p.skills.every(k=>k in SKILLS)&&new Set(p.skills).size===p.skills.length,'Выберите разные навыки.');
    assert(p.aspect in ASPECTS,'Выберите аспект.');assert(Array.isArray(p.actorUuids)&&p.actorUuids.length&&new Set(p.actorUuids).size===p.actorUuids.length,'Выберите участников.');
    const participants=p.actorUuids.map(uuid=>{const a=actorFor(user,null,uuid);assert(a.type==='fated','Участники — Сужденные.');return {uuid:a.uuid,name:a.name};});
    const t={name,duration,participants,skills:p.skills,aspect:p.aspect,tn:integer(p.tn,0,99),goal:integer(p.goal,1,999),limit:integer(p.limit,1,999),interval:1,successes:0,failures:0,status:'open',rows:[]};
    return foundry.documents.ChatMessage.create({content:taskHTML(t),flags:{[ID]:{ongoing:t}}});
  }
  const {m,t}=getTask(p.messageId);
  if(p.op==='taskContribute'){
    assert(t.status==='open','Задача уже завершена.');const a=actorFor(user,p.actorId,p.actorUuid);
    assert(t.participants.some(x=>x.uuid===a.uuid)&&t.skills.includes(p.skill),'Персонаж или навык не разрешён для задачи.');
    assert(!t.rows.some(x=>x.actorUuid===a.uuid&&x.interval===t.interval),'В этом интервале уже сделан или начат вклад.');
    const spec={kind:'duel',skill:p.skill,aspect:t.aspect,tn:t.tn,positive:integer(p.positive??0,0,99),negative:integer(p.negative??0,0,99),checkReason:t.name};duelPlan(a,spec);
    const row={actorUuid:a.uuid,interval:t.interval,messageId:'pending',pending:true};t.rows.push(row);await saveTask(m,t);
    const child=await startDuel(a,spec),d=foundry.utils.deepClone(child.getFlag(ID,'duel'));
    row.messageId=child.id;d.ongoing={messageId:m.id,interval:t.interval};await saveTask(m,t);return saveDuel(child,d);
  }
  assert(user.isGM,'Интервалы и восстановление задачи подтверждает мастер.');
  if(p.op==='taskRecover'){
    const row=t.rows.find(r=>r.actorUuid===p.actorUuid&&r.interval===t.interval);assert(row,'Нет прерванного вклада.');
    const d=game.messages.get(row.messageId)?.getFlag(ID,'duel');
    if(row.pending&&d?.closed&&d.stage!=='cancelled'){assert(d.ongoing?.messageId===m.id,'Связь с задачей отсутствует: требуется ручная сверка.');return recordContribution(game.messages.get(row.messageId),d);}
    assert(row.cancelled||row.pending&&(!d||d.stage==='cancelled'),'Сначала отмените незавершённую проверку в Столе Судьбы.');
    t.rows=t.rows.filter(r=>r!==row);return saveTask(m,t);
  }
  if(p.op==='taskClose'){assert(!t.rows.some(r=>r.pending),'Сначала завершите или отмените открытые проверки.');t.status='closed';return saveTask(m,t);}
  assert(p.op==='taskNext'&&t.status==='open','Задача не открыта.');
  assert(t.participants.every(a=>t.rows.some(r=>r.actorUuid===a.uuid&&r.interval===t.interval&&!r.pending&&!r.cancelled)),'Сначала каждый участник завершает вклад текущего интервала.');
  t.interval++;return saveTask(m,t);
}
