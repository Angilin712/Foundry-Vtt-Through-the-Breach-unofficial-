// Pure rules: core rulebook, printed pp. 79–80, 170–171, 281–289, 292, 300–301.
export const ID = "through-the-breach";
export const SUITS = {rams: "Бараны", crows: "Вороны", tomes: "Томы", masks: "Маски"};
export const SYMBOLS = {rams: "♥", crows: "♠", tomes: "♣", masks: "♦"};
export const ASPECTS = {might:"Мощь", grace:"Грация", speed:"Скорость", resilience:"Стойкость", intellect:"Интеллект", charm:"Обаяние", cunning:"Хитрость", tenacity:"Упорство"};
export const GROUPS = {academic:"Академические", close:"Ближний бой", ranged:"Дальний бой", craft:"Ремесленные", expertise:"Экспертные", social:"Социальные", training:"Тренированные", magic:"Магические"};
const rows = [
  ["bureaucracy","Бюрократия","cunning","academic"],["engineering","Инженерия","intellect","academic"],["history","История","intellect","academic"],["literacy","Грамотность","intellect","academic"],["mathematics","Математика","intellect","academic"],["music","Музыка","charm","academic"],
  ["flexible","Гибкое оружие","grace","close"],["grappling","Борьба","speed","close"],["heavyMelee","Тяжёлое рукопашное","might","close"],["martialArts","Боевые искусства","speed","close"],["melee","Рукопашное","might","close"],["pneumatic","Пневматика","might","close"],["pugilism","Атака кулаками","might","close"],
  ["archery","Стрельба из лука","grace","ranged"],["heavyGuns","Тяжёлый огнестрел","might","ranged"],["longArms","Длинноствол","intellect","ranged"],["pistol","Пистолеты","grace","ranged"],["shotgun","Дробовики","grace","ranged"],["thrown","Метательное оружие","grace","ranged"],
  ["alchemistry","Алхимия","intellect","craft"],["art","Искусство","cunning","craft"],["artefacting","Артефактинг","intellect","craft"],["blacksmithing","Кузнечное дело","intellect","craft"],["culinary","Кулинария","charm","craft"],["explosives","Взрывное дело","intellect","craft"],["homesteading","Быт","tenacity","craft"],["printing","Печать","intellect","craft"],["stitching","Сшивание","tenacity","craft"],
  ["doctor","Доктор","intellect","expertise"],["forgery","Подделка","cunning","expertise"],["gambling","Азарт","cunning","expertise"],["husbandry","Скотоводство","charm","expertise"],["lockpicking","Вскрытие замков","grace","expertise"],["notice","Заметливость","cunning","expertise"],["track","Слежка","cunning","expertise"],["wilderness","Глухомань","cunning","expertise"],
  ["barter","Бартер","tenacity","social"],["bewitch","Очарование","charm","social"],["convince","Убеждение","intellect","social"],["deceive","Обман","cunning","social"],["intimidate","Запугивание","tenacity","social"],["leadership","Лидерство","charm","social"],["scrutiny","Контроль","cunning","social"],
  ["acrobatics","Акробатика","grace","training"],["athletics","Атлетика","might","training"],["carouse","Куролесенье","resilience","training"],["centering","Концентрация","tenacity","training"],["evade","Уклонение","speed","training"],["pickpocket","Карманник","speed","training"],["stealth","Скрытность","cunning","training"],["toughness","Жесткость","resilience","training"],
  ["counterspelling","Анти-чары","tenacity","magic"],["enchanting","Зачарование","charm","magic"],["necromancy","Некромантия","charm","magic"],["sorcery","Колдовство","intellect","magic"],["prestidigitation","Фокусы","cunning","magic"]
];
export const SKILLS = Object.fromEntries(rows.map(([id,label,aspect,group]) => [id,{id,label,aspect,group}]));
export const TWIST_VALUES = [[1,5,9,13],[4,8,12],[3,7,11],[2,6,10]];
export const TWIST_ROLES = ["Определяющая", "Предков", "Центральная", "Наследия"];
export const DEFAULT_TWIST = ["rams","crows","tomes","masks"];
export function assert(ok, message) { if (!ok) throw new Error(message); }
export function integer(value, min=-100, max=100) {
  const n=Number(value); assert(Number.isInteger(n) && n>=min && n<=max, `Ожидается целое число от ${min} до ${max}.`); return n;
}
export function modifier(positive=0, negative=0) { return Math.max(-3, Math.min(3, integer(positive,0,99)-integer(negative,0,99))); }
export function cardName(c) { return c.value===0 ? "Чёрный джокер" : c.value===14 ? "Красный джокер" : `${c.value} · ${SUITS[c.suit]}`; }
export function makeFateDeck() {
  return [...Object.keys(SUITS).flatMap(suit=>Array.from({length:13},(_,i)=>({value:i+1,suit}))),{value:0,suit:""},{value:14,suit:""}];
}
export function makeTwistDeck(suits) {
  assert(Array.isArray(suits) && suits.length===4 && new Set(suits).size===4 && suits.every(s=>s in SUITS), "Выберите четыре разные масти для Смешанной колоды.");
  return suits.flatMap((suit,i)=>TWIST_VALUES[i].map(value=>({value,suit})));
}
export function selectable(cards, mod) {
  assert(cards.length>0,"Нет карт для выбора.");
  const black=cards.findIndex(c=>c.value===0);
  if (black>=0) return [black];
  if (mod>=0) return cards.map((_,i)=>i);
  const minimum=Math.min(...cards.map(c=>c.value));
  return cards.map((c,i)=>c.value===minimum || c.value===14 ? i : -1).filter(i=>i>=0);
}
export function canCheat(d) { return d.kind!=="initiative" && !d.npc && d.mod>=0 && !d.cards.some(c=>c.value===0) && !d.cheated && d.selected!==null && !d.closed; }
export function parseSuits(text="") {
  const map={R:"rams",C:"crows",T:"tomes",M:"masks","♥":"rams","♠":"crows","♣":"tomes","♦":"masks"};
  const clean=String(text).toUpperCase().replace(/[\s,;+]/g,"");
  assert(clean.length<=12 && [...clean].every(x=>map[x]),"Масти: R — Бараны, C — Вороны, T — Томы, M — Маски. Например: TT или RM.");
  return [...clean].map(x=>map[x]);
}
export function containsSuits(have, need) { const left=[...have]; return need.every(s=>{const i=left.indexOf(s); if(i<0)return false; left.splice(i,1); return true;}); }
export function activeItems(s){return Array.from(s.parent?.items??[]).filter(i=>i.system.equipped&&i.system.quantity>0&&(i.system.category!=='pursuit'||i.id===s.currentPursuitId));}
export function itemBonus(s,target){return activeItems(s).filter(i=>i.system.bonusTarget===target).reduce((n,i)=>n+i.system.bonus,0);}
export function aspectValue(s,key){return s.aspects[key]+(s.temporaryAspects?.[key]??0)+itemBonus(s,`aspect.${key}`);}
export function skillValue(s,key,aspect=s.skills[key].aspect){assert(aspect in ASPECTS,'Неизвестный аспект.');return s.skills[key].rank+aspectValue(s,aspect)+itemBonus(s,`skill.${key}`);}
export function armorValue(s){
  if(!s.autoArmor)return Math.min(3,Math.max(0,(s.armor??0)+itemBonus(s,'armor')));
  const slots=new Map();for(const i of activeItems(s)){const x=i.system;if(['arms','legs','head','chest'].includes(x.armorSlot)&&['light','heavy'].includes(x.armorType))slots.set(x.armorSlot,slots.get(x.armorSlot)==='heavy'?'heavy':x.armorType);}
  const base=slots.size?slots.size>=3&&[...slots.values()].includes('heavy')?2:1:0;
  return Math.min(3,Math.max(0,base+itemBonus(s,'armor')));
}
export function derived(s) {
  const a=Object.fromEntries(Object.keys(ASPECTS).map(k=>[k,aspectValue(s,k)])), k=s.skills, b=Object.fromEntries(Object.keys(s.bonuses).map(k=>[k,s.bonuses[k]+itemBonus(s,k)]));
  const walk=4+(s.walkRoundUp?Math.ceil:Math.floor)(a.speed/2)+b.walk;
  return {armor:armorValue(s),defense:2+Math.max(a.speed,k.evade.rank)+b.defense-armorValue(s), willpower:2+Math.max(a.tenacity,k.centering.rank)+b.willpower,
    wounds:s.rankWounds?s.rank:4+k.toughness.rank+Math.ceil(Math.max(0,a.resilience)/2)+b.wounds,
    initiative:a.speed+k.notice.rank+b.initiative,walk,charge:s.canCharge===false?0:Math.max(s.allowShortCharge?0:walk,4+a.speed+b.charge)};
}
export function defenseSuits(s, stat) {
  const skill=stat==="defense"?"evade":"centering", aspect=stat==="defense"?"speed":"tenacity";
  return s.skills[skill].rank>=aspectValue(s,aspect)?parseSuits(s.skills[skill].suits):[];
}
export function damage(card, track) {return card.value===0?0:track[card.value<=5?0:card.value<=10?1:2];}
export function accuracy(margin) {return margin===0?-2:margin<=5?-1:margin<=10?0:1;}
export function outcome(d) {
  if(d.selected===null)return null;
  const c=d.replacement??d.cards[d.selected];
  const suits=[...d.baseSuits,...(!c.rank&&c.value===14?(d.redSuit?[d.redSuit]:[]):c.suit?[c.suit]:[])];
  const total=d.base+c.value;
  const margin=total-d.tn,numericSuccess=margin>=0,suitSuccess=containsSuits(suits,d.required),success=numericSuccess&&suitSuccess;
  const successDegrees=success?Math.floor(margin/5):0,failureDegrees=numericSuccess?0:Math.floor(-margin/5);
  return {card:c,total,suits,success,numericSuccess,suitSuccess,margin,successDegrees,failureDegrees,
    degrees:success?successDegrees:failureDegrees,damage:damage(c,d.track??[0,0,0]),critical:c.value===14};
}
export function escapeHTML(value) {return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

export function statRank(s,stat){return s.unconscious||stat==='defense'&&s.rankDefense===false?0:s.rank;}
