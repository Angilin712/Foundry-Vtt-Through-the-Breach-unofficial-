// Core book, printed pp. 262, 272–277. Recipes contain inventory IDs, never trusted totals.
import {ID,SKILLS,ASPECTS,SUITS,assert,integer,parseSuits} from './rules.mjs';
import {spellCombatData} from './spell-effects.mjs';
const repeated=new Set(['Изменение Дальности','Игнорировать персонажа','Увеличить ОД','Усилить Импульс','Повышение сопротивляемости','Повысить урон','Увеличенная длительность','Уменьшить ОД','Уменьшить урон','Снизить сопротивление','Тьма','Разложение','Свет','Природа','Ветер','Ужас']);
const capped={'Взрыв':3,'Огонь':3,'Яд':3,'Лед':2};
const letters={rams:'R',crows:'C',tomes:'T',masks:'M'};
export function immutoRule(item){
  const meta=item.getFlag?.(ID,'catalog')??item.flags?.[ID]?.catalog;
  const name=meta?.key?.startsWith('immuto-')?meta.key.slice(7):'';
  return {name,key:meta?.key??item.id,max:capped[name]??(repeated.has(name)?99:name?1:item.system.maxCopies),parameter:name==='Дополнительная Масть'?'suit':name==='Изменение Дальности'?'range':name==='Задержка'?'delay':name==='Объект фокуса'?'focus':name==='Комбинированное заклинание'?'magia':''};
}
export function spellComponent(actor,id,kind){
  const i=actor.items.get(id),s=i?.system;
  assert(i?.type==='magic'&&s.magicKind===kind&&s.quantity>0,'Магия или Иммуто отсутствует в листе.');
  const configured=i.getFlag?.(ID,'catalog')??i.flags?.[ID]?.catalog;
  assert(s.equipped||(kind==='immuto'&&configured?.configurationRequired&&['Дополнительная Масть','Изменение Дальности','Задержка','Объект фокуса'].includes(immutoRule(i).name)),'Магия или Иммуто отключена.');
  if(s.grimoireId){const g=actor.items.get(s.grimoireId);assert(g?.system.magicKind==='grimoire'&&g.system.attuned&&actor.system.activeGrimoire===g.id,'Нужна настройка на Гримуар компонента заклинания.');}
  return i;
}
export function compileSpell(actor,recipe){
  assert(recipe&&typeof recipe==='object','Нет состава заклинания.');
  const base=spellComponent(actor,recipe.baseId,'magia'),s=base.system;
  assert(s.skill in SKILLS&&SKILLS[s.skill].group==='magic'&&s.aspect in ASPECTS,'У основы должны быть магический навык и аспект.');
  const rows=recipe.immutos??[];assert(Array.isArray(rows)&&rows.length<=36,'Слишком много Иммуто.');
  const seen=new Set(),lines=[`${base.name}: СЛ ${s.tn} ${s.required}, ${s.apCost} ОД.`],focusUpdates=[];
  let tn=s.tn,ap=s.apCost,required=s.required,resistance=s.resistance,range=s.range,ignoreArmor=s.ignoreArmor;
  for(const row of rows){
    const i=spellComponent(actor,row.itemId,'immuto'),x=i.system,rule=immutoRule(i),count=integer(row.count??1,1,rule.max);
    assert(!seen.has(rule.key),'Укажите повторения одного вида Иммуто в одной строке.');seen.add(rule.key);
    let adjustment=x.tnAdjustment*count;
    if(rule.parameter==='suit'){assert(row.suit in SUITS,'Выберите дополнительную масть.');required+=letters[row.suit];adjustment=-3;}
    if(rule.parameter==='range'){
      assert(['up','down'].includes(row.choice),'Выберите направление изменения дальности.');
      const values=[1,2,3,5,10,15,30,50,Infinity],isLOS=/видим|line of sight/i.test(range),num=Number(range.match(/\d+/)?.[0]);
      assert(isLOS||num>0,'У Магии нет числовой дальности; эту комбинацию разрешает мастер.');
      const index=isLOS?8:values.slice(0,8).reduce((best,n,k)=>Math.abs(n-num)<Math.abs(values[best]-num)?k:best,0),step=row.choice==='up'?count:-count,next=index+step;
      assert(next>=0&&next<values.length,'Изменение выходит за таблицу дальности.');
      const tagged=/[yz]/i.test(range);range=next===8?'В пределах видимости':`${tagged?(next<3?'y':'z'):''}${values[next]} ярд${values[next]===1?'':values[next]<5?'а':'ов'}`;adjustment=step*2;
    }
    if(rule.name==='Альтернативная сопротивляемость'){assert(['defense','willpower'].includes(resistance),'У Магии нет сопротивления для замены.');resistance=resistance==='defense'?'willpower':'defense';}
    if(rule.parameter==='delay'){assert(['rounds','condition'].includes(row.choice),'Выберите тип задержки.');if(row.choice==='rounds')integer(row.rounds,1,10);else assert(String(row.text??'').trim(),'Опишите условие задержки.');adjustment=row.choice==='rounds'?2:5;}
    if(rule.parameter==='focus'){
      const text=String(row.text??'').trim();assert(text&&text.length<=200,'Укажите объект фокуса.');
      const portability=integer(row.portability,0,3),rarity=integer(row.rarity,0,3);
      if(x.focusObject)assert(x.focusObject===text&&x.focusPortability===portability&&x.focusRarity===rarity,'Объект фокуса закреплён при изучении Иммуто; изменить его может мастер в записи.');
      else focusUpdates.push({id:i.id,text,portability,rarity});
      adjustment=-portability-rarity;
    }
    if(rule.parameter==='magia'){
      const second=spellComponent(actor,row.magiaId,'magia'),key=i=>i.getFlag?.(ID,'catalog')?.key??i.flags?.[ID]?.catalog?.key??i.id;assert(key(second)!==key(base)&&second.system.tn<=s.tn&&second.system.resistance===s.resistance,'Вторая Магия должна отличаться, иметь не большую базовую СЛ и то же сопротивление.');
      lines.push(`Вторая Магия: ${second.name}\n${second.system.description}`);
    }
    if(rule.name==='Электричество'||rule.name==='Дух')ignoreArmor=true;
    tn+=adjustment;ap+=x.apAdjustment*count;
    lines.push(`${i.name} ×${count}: СЛ ${adjustment>=0?'+':''}${adjustment}${rule.parameter==='suit'?' · '+SUITS[row.suit]:''}${row.text?' · '+row.text:''}${rule.parameter==='delay'&&row.choice==='rounds'?' · '+row.rounds+' раундов':''}\n${x.description}`);
  }
  if(rows.some(r=>immutoRule(actor.items.get(r.itemId)).name==='Усилить Импульс'))assert(rows.some(r=>immutoRule(actor.items.get(r.itemId)).name==='Импульс')||/импульс/i.test(s.description),'Усилить Импульс требует эффекта Импульса.');
  parseSuits(required);ap=Math.max(0,ap);integer(ap,0,99);integer(tn,0,99);
  const combat=spellCombatData(base,rows.map(row=>({item:actor.items.get(row.itemId),count:row.count??1})));
  return {base,tn,ap,required,resistance,range,skill:s.skill,aspect:s.aspect,duration:s.duration,ignoreArmor,focusUpdates,...combat,description:`${s.description}\n\nСостав заклинания:\n${lines.join('\n\n')}\n\nСовместимость, теория и применение эффектов проверяются по книге.`,breakdown:lines.map(t=>t.split('\n')[0])};
}
