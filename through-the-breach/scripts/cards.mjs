import {ID,SUITS,SKILLS,ASPECTS,makeFateDeck,makeTwistDeck,cardName,assert,integer,modifier,selectable,canCheat,parseSuits,derived,defenseSuits,outcome,escapeHTML as e} from "./rules.mjs";
const {Cards,ChatMessage}=foundry.documents;

export const stack=(role,actorId="")=>game.cards.find(s=>s.getFlag(ID,"role")===role && (s.getFlag(ID,"actorId")??"")===actorId);
export const authority=()=>game.users.activeGM;
const nativeCard=c=>({id:c.id,value:c.value,suit:c.suit,name:c.name,img:c.faces[0]?.img});
const gms=()=>game.users.filter(u=>u.isGM).map(u=>u.id);
const ACTION_LABELS={setup:"Подготовка колоды",setupActor:"Личная колода",shuffle:"Перетасовка",prologue:"Конец пролога",endDrama:"Конец сцены",give:"Выдача карты",discard:"Сброс карт",credit:"Добор за перетасовку",declineCredit:"Отказ от добора",refresh:"Обновление руки",duel:"Проверка",pick:"Выбор карты",red:"Масть джокера",cheat:"Обман судьбы",finish:"Завершение проверки",recover:"Отмена проверки"};
const publicNote=content=>ChatMessage.create({content:`<div class="ttb-chat">${content}</div>`});
let queue=Promise.resolve();
const seen=new Set();
export function enqueue(task){const next=queue.then(task);queue=next.catch(err=>console.error(`${ID} |`,err));return next;}

function cardData(c,index){const key=c.value===0?"black-joker":c.value===14?"red-joker":`${c.suit}-${c.value}`;return {
  name:cardName(c),suit:c.suit,value:c.value,sort:index,face:0,
  faces:[{img:`systems/${ID}/assets/cards/${key}.svg`,name:cardName(c)}],
  back:{img:`systems/${ID}/assets/cards/back.svg`},width:240,height:340
};}
async function createStack(role,name,type,actorId="",cards=[]){
  if(stack(role,actorId))return stack(role,actorId);
  return Cards.create({name,type,ownership:{default:0},cards:cards.map(cardData),flags:{[ID]:{role,actorId}},img:`systems/${ID}/assets/cards/back.svg`});
}
export async function setup(){
  assert(game.user.isGM,"Настройка доступна мастеру.");
  const exists=stack("fate");
  const deck=await createStack("fate","Колода Судьбы","deck","",makeFateDeck());
  await createStack("discard","Сброс Судьбы","pile");
  await createStack("active","Карты незавершённых проверок","pile");
  if(!exists)await deck.shuffle({chatNotification:false});
  return deck;
}
export async function syncHand(actor){
  const hand=stack("hand",actor.id);if(!hand)return;
  const ownership={default:0};
  for(const user of game.users)if(!user.isGM && actor.testUserPermission(user,"OWNER"))ownership[user.id]=2;
  await hand.update({ownership},{diff:false,recursive:false});
}
async function setupActor(actor){
  assert(actor.type==="fated","Личная колода есть только у Сужденного.");
  await setup();
  const exists=stack("twist",actor.id);
  const cards=makeTwistDeck(Array.from(actor.system.twist));
  const deck=await createStack("twist",`${actor.name} · Смешанная колода`,"deck",actor.id,cards);
  await createStack("twistDiscard",`${actor.name} · Личный сброс`,"pile",actor.id);
  await createStack("hand",`${actor.name} · Рука контроля`,"hand",actor.id);
  await syncHand(actor);
  if(!exists)await deck.shuffle({chatNotification:false});
  await publicNote(`Личная колода <b>${e(actor.name)}</b> готова: 13 карт. Раздача — кнопкой «Конец пролога» у мастера.`);
}
async function reshuffle(deck,discard,benefit=false){
  if(discard.cards.size)await discard.pass(deck,discard.cards.map(c=>c.id),{chatNotification:false});
  await deck.shuffle({chatNotification:false});
  if(benefit){
    for(const hand of game.cards.filter(s=>s.getFlag(ID,"role")==="hand"))await hand.setFlag(ID,"credits",(hand.getFlag(ID,"credits")??0)+1);
    await publicNote("Колода Судьбы перетасована. Каждый Сужденный с личной колодой может взять одну Смешанную карту. Карты текущих проверок остаются на столе.");
  }
}
async function drawFrom(deck,discard,to,count,benefit=false){
  const drawn=[];
  for(let i=0;i<count;i++){
    if(!deck.availableCards.length){
      assert(discard.cards.size>0,"Нет доступных карт. Завершите открытые проверки или сбросьте карты из руки.");
      await reshuffle(deck,discard,benefit);
    }
    drawn.push(...await to.draw(deck,1,{chatNotification:false,updateData:{face:0}}));
  }
  return drawn;
}
async function drawHand(actor,count){
  const hand=stack("hand",actor.id),deck=stack("twist",actor.id),discard=stack("twistDiscard",actor.id);
  assert(hand&&deck&&discard,"Мастер должен создать личную колоду персонажа.");
  assert(deck.availableCards.length+discard.cards.size>=count,"В личной колоде и сбросе недостаточно карт.");
  await drawFrom(deck,discard,hand,count);
  await publicNote(`${e(actor.name)} берёт ${count} Смешанн. карт. В руке: ${hand.cards.size}${hand.cards.size>5?". Нужно сбросить лишние до пяти перед продолжением":""}.`);
}
async function discardHand(actor,ids){
  const hand=stack("hand",actor.id);assert(hand,"Личная колода ещё не создана.");
  assert(Array.isArray(ids)&&ids.length>0&&new Set(ids).size===ids.length&&ids.every(id=>hand.cards.has(id)),"Выберите карты из своей руки.");
  await hand.pass(stack("twistDiscard",actor.id),ids,{chatNotification:false});
}
function actorFor(user,id,uuid){const actor=uuid?fromUuidSync(uuid):game.actors.get(id);assert(actor?.documentName==="Actor","Персонаж не найден.");assert(user.isGM||actor.testUserPermission(user,"OWNER"),"Можно управлять только своим персонажем.");return actor;}
function requireGM(user){assert(user.isGM,"Это действие выполняет мастер.");}
function requireHandLimit(actor){const hand=stack("hand",actor.id);assert(!hand||hand.cards.size<=5,"Сначала сбросьте лишние карты: в руке должно быть не больше пяти.");}
function getDuel(user,id){
  const message=game.messages.get(id),d=message?.getFlag(ID,"duel");
  assert(d && message.author?.isGM,"Проверка не найдена.");
  const actor=actorFor(user,d.actorId,d.actorUuid);assert(!d.closed,"Проверка уже завершена.");assert(d.stage!=="drawing","Проверка ещё подготавливается; при сбое обратитесь к мастеру.");
  return {message,d:foundry.utils.deepClone(d),actor};
}
export function duelHTML(d){
  const r=outcome(d), selected=d.replacement??d.cards[d.selected];
  const options=d.cards.map((c,i)=>`<span class="ttb-flip ${i===d.selected?"chosen":""}"><img src="${e(c.img??"")}" alt="${e(c.name)}"><span>${e(c.name)}</span>${!d.closed&&d.selected===null&&selectable(d.cards,d.mod).includes(i)?`<button type="button" data-ttb="pick" data-index="${i}">Выбрать</button>`:""}</span>`).join("");
  let result="Выберите карту для проверки.";
  if(r){
    result=d.kind==="damage"?`Урон: <b>${r.damage}</b>${r.critical?" · тяжёлый критический эффект (разрешается вручную)":""}`:
      d.kind==="initiative"?`Инициатива: <b>${r.total}</b>`:
      `Итог: <b>${r.total} ${r.suits.map(s=>SYMBOL(s)).join(" ")}</b> / СЛ ${d.tn}${d.required.length?` ${d.required.map(s=>SYMBOL(s)).join(" ")}`:""} · <b>${r.success?"Успех":"Неудача"}</b> · разница ${r.margin>=0?"+":""}${r.margin}`;
    if(d.kind==="duel")result+=`<small>Основа ${d.base} + карта ${selected.value}. Степеней ${r.success?"успеха":"провала"}: ${r.degrees}. Триггеры разрешаются вручную.</small>`;
  }
  if(d.stage==="cancelled")result="Проверка отменена мастером. Результат не применяется.";
  return `<section class="ttb-chat" data-duel="true"><header>${e(d.actorName)} · ${e(d.label)}</header><p>Модификатор судьбы: ${d.mod>0?"+":""}${d.mod}${d.npc&&d.kind!=="damage"?" · фиксированное значение ранга":""}</p><div class="ttb-flips">${options}</div>${d.replacement?`<p>Обман судьбы: <b>${e(d.replacement.name)}</b></p>`:""}<div class="ttb-result">${result}</div>${!d.closed&&r?`<div class="ttb-chat-actions">${selected?.value===14&&!selected.rank?`<button type="button" data-ttb="red">Масть джокера${d.redSuit?`: ${e(SUITS[d.redSuit])}`:""}</button>`:""}${canCheat(d)?`<button type="button" data-ttb="cheat">Обмануть судьбу</button>`:""}<button type="button" data-ttb="finish">Завершить</button></div>`:""}<footer>${d.closed?(d.stage==="cancelled"?"Проверка отменена · карты сброшены":"Проверка завершена · карты сброшены"):"Проверка открыта · карты удерживаются на столе"}</footer></section>`;
}
const SYMBOL=s=>({rams:"♥",crows:"♠",tomes:"♣",masks:"♦"}[s]??"");
async function saveDuel(message,d){await message.update({[`flags.${ID}.duel`]:d,content:duelHTML(d)});}
async function choose(message,d,index){
  assert(d.selected===null,"Карта уже выбрана.");assert(selectable(d.cards,d.mod).includes(index),"Правила не разрешают выбрать эту карту.");
  d.selected=index;
  const discardIds=d.cards.filter((_,i)=>i!==index).map(c=>c.id).filter(id=>stack("active").cards.has(id));
  if(discardIds.length)await stack("active").pass(stack("discard"),discardIds,{chatNotification:false});
  await saveDuel(message,d);
}
async function startDuel(actor,p){
  requireHandLimit(actor);
  assert(!(stack("hand",actor.id)?.getFlag(ID,"credits")>0),"Сначала возьмите или отклоните карту за перетасовку во вкладке «Судьба и рука».");
  assert(!game.messages.some(m=>{const d=m.getFlag(ID,"duel");return m.author?.isGM&&(d?.actorUuid??d?.actorId)===(d?.actorUuid?actor.uuid:actor.id)&&!d?.closed;}),"Сначала завершите предыдущую проверку этого персонажа в чате.");
  assert(["duel","initiative","damage"].includes(p.kind),"Неизвестный вид проверки.");
  const npc=actor.type==="npc",s=actor.system,computed=derived(s);
  let base=0,baseSuits=[],label=p.kind==="damage"?"Флип урона":p.kind==="initiative"?"Инициатива":"Проверка";
  if(p.kind==="initiative")base=computed.initiative;
  else if(p.kind==="duel"){
    if(p.skill in SKILLS){const k=s.skills[p.skill];assert(p.aspect in ASPECTS,"Выберите аспект.");base=k.rank+s.aspects[p.aspect];baseSuits=parseSuits(k.suits);label=SKILLS[p.skill].label;}
    else if(["defense","willpower"].includes(p.skill)){base=computed[p.skill];baseSuits=defenseSuits(s,p.skill);label=p.skill==="defense"?"Защита":"Сила воли";}
    else if(p.skill in ASPECTS){base=s.aspects[p.skill];label=ASPECTS[p.skill];}
    else throw new Error("Неизвестный навык или аспект.");
  }
  base+=integer(p.bonus??0);
  const mod=p.kind==="initiative"?0:modifier(p.positive,p.negative);
  if(npc&&p.kind==="duel")base+=2*mod;
  const d={actorId:actor.id,actorUuid:actor.uuid,actorName:actor.name,kind:p.kind,npc,label,base,baseSuits,tn:integer(p.tn??0,0,99),required:parseSuits(p.required),mod,cards:[],selected:null,replacement:null,redSuit:"",cheated:false,closed:false,stage:"drawing",track:(p.track??[1,2,3]).map(n=>integer(n,0,999)),combatantId:p.combatantId??null,combatId:p.combatId??null};
  assert(d.track.length===3,"Укажите три значения урона.");
  assert(stack("fate")&&stack("active")&&stack("discard"),"Мастер должен подготовить общую колоду.");
  const message=await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<p>${e(actor.name)}: подготовка ${e(label)}…</p>`,flags:{[ID]:{duel:d}}});
  if(npc&&p.kind!=="damage")d.cards=[{id:"rank",rank:true,value:s.rank,suit:"",name:`Ранг ${s.rank}`,img:`systems/${ID}/assets/cards/back.svg`}];
  else {
    // Draw one at a time so exhaustion in the middle preserves already drawn cards.
    for(let i=0;i<1+Math.abs(mod);i++){
      d.cards.push(...(await drawFrom(stack("fate"),stack("discard"),stack("active"),1,true)).map(nativeCard));
      await message.setFlag(ID,"duel",d);
    }
  }
  d.stage="select";
  const choices=selectable(d.cards,mod);
  if(choices.length===1)await choose(message,d,choices[0]);else await saveDuel(message,d);
  if(p.kind==="initiative")await finish(message,d,actor);
}
async function finish(message,d,actor){
  assert(d.selected!==null,"Сначала выберите карту.");
  const card=d.replacement??d.cards[d.selected];
  assert(card.rank||card.value!==14||d.kind!=="duel"||d.redSuit,"Выберите масть красного джокера.");
  const active=stack("active");
  const fateIds=d.cards.map(c=>c.id).filter(id=>active.cards.has(id));
  if(fateIds.length)await active.pass(stack("discard"),fateIds,{chatNotification:false});
  if(d.replacement&&active.cards.has(d.replacement.id))await active.pass(stack("twistDiscard",actor.id),[d.replacement.id],{chatNotification:false});
  if(d.kind==="initiative"){
    const combat=game.combats.get(d.combatId),combatant=combat?.combatants.get(d.combatantId);
    if(combatant?.actor?.uuid===actor.uuid)await combat.setInitiative(combatant.id,outcome(d).total);
  }
  d.closed=true;d.stage="closed";await saveDuel(message,d);
}
export async function execute(user,p){
  assert(user?.active,"Пользователь не подключён.");
  const gmOps=["setup","setupActor","shuffle","prologue","endDrama","give","recover"];
  if(gmOps.includes(p.op))requireGM(user);
  if(p.op==="setup")return setup();
  if(p.op==="shuffle"){await setup();return reshuffle(stack("fate"),stack("discard"),true);}
  if(p.op==="prologue"){
    for(const hand of game.cards.filter(s=>s.getFlag(ID,"role")==="hand")){const a=game.actors.get(hand.getFlag(ID,"actorId"));if(a)await drawHand(a,3);}return;
  }
  if(p.op==="endDrama"){
    for(const hand of game.cards.filter(s=>s.getFlag(ID,"role")==="hand"))await hand.setFlag(ID,"refresh",true);
    return publicNote("Драматическое время завершено. Выберите карты для сброса в листе и нажмите «Обновить руку после сцены»: добор до трёх.");
  }
  if(p.op==="recover"){
    const message=game.messages.get(p.messageId),d=message?.getFlag(ID,"duel");assert(d&&!d.closed,"Нет незавершённой проверки.");
    const copy=foundry.utils.deepClone(d),active=stack("active");
    for(const c of [...copy.cards,...(copy.replacement?[copy.replacement]:[])]){
      const card=active.cards.get(c.id);if(!card)continue;
      const dest=card.origin?.getFlag(ID,"role")==="twist"?stack("twistDiscard",copy.actorId):stack("discard");
      await active.pass(dest,[c.id],{chatNotification:false});
    }
    copy.closed=true;copy.stage="cancelled";await saveDuel(message,copy);return;
  }
  if(["pick","red","cheat","finish"].includes(p.op)){
    const {message,d,actor}=getDuel(user,p.messageId);
    if(p.op==="pick")return choose(message,d,integer(p.index,0,d.cards.length-1));
    if(p.op==="red"){const c=d.replacement??d.cards[d.selected];assert(c?.value===14&&!c.rank&&p.suit in SUITS,"Нужен красный джокер и допустимая масть.");d.redSuit=p.suit;return saveDuel(message,d);}
    if(p.op==="finish")return finish(message,d,actor);
    requireHandLimit(actor);assert(canCheat(d),"В этой проверке нельзя обмануть судьбу.");
    const hand=stack("hand",actor.id),card=hand?.cards.get(p.cardId);assert(card,"Этой карты нет в вашей руке.");
    const replacement=nativeCard(card),old=d.cards[d.selected];
    await hand.pass(stack("active"),[card.id],{chatNotification:false});
    // Persist the replacement before returning the old card, allowing recovery after a disconnect.
    d.replacement=replacement;d.cheated=true;await message.setFlag(ID,"duel",d);
    if(stack("active").cards.has(old.id))await stack("active").pass(stack("discard"),[old.id],{chatNotification:false});
    return saveDuel(message,d);
  }
  const actor=actorFor(user,p.actorId,p.actorUuid);
  if(p.op==="setupActor")return setupActor(actor);
  if(p.op==="give")return drawHand(actor,1);
  if(p.op==="discard")return discardHand(actor,p.ids);
  if(p.op==="declineCredit"){
    const hand=stack("hand",actor.id),credits=hand?.getFlag(ID,"credits")??0;assert(credits>0,"Нет добора за перетасовку.");return hand.setFlag(ID,"credits",credits-1);
  }
  if(p.op==="credit"){
    requireHandLimit(actor);const hand=stack("hand",actor.id),credits=hand?.getFlag(ID,"credits")??0;assert(credits>0,"Нет добора за перетасовку.");
    await drawHand(actor,1);return hand.setFlag(ID,"credits",credits-1);
  }
  if(p.op==="refresh"){
    const hand=stack("hand",actor.id);assert(hand?.getFlag(ID,"refresh"),"Мастер ещё не объявил конец Драматического времени.");
    if(p.ids?.length)await discardHand(actor,p.ids);
    if(hand.cards.size<3)await drawHand(actor,3-hand.cards.size);
    return hand.setFlag(ID,"refresh",false);
  }
  if(p.op==="duel")return startDuel(actor,p);
  throw new Error("Неизвестное действие.");
}

// Authenticated ChatMessage requests: core v14 validates author on the server.
// No user identity supplied through an unauthenticated custom socket is trusted.
export async function request(payload){
  assert(authority(),"Для работы с колодами мастер должен быть подключён к миру.");
  const message=await ChatMessage.create({content:`<p>${e(ACTION_LABELS[payload.op]??"Карточное действие")} · ожидает обработки мастером.</p>`,whisper:gms(),flags:{[ID]:{request:payload,status:"pending"}}});
  return new Promise((resolve,reject)=>{
    const check=m=>{if(m.id!==message.id)return;const status=m.getFlag(ID,"status");if(!["done","error"].includes(status))return;cleanup();status==="done"?resolve():reject(new Error(m.getFlag(ID,"error")??"Ошибка обработки."));};
    const hook=Hooks.on("updateChatMessage",check);
    const timer=setTimeout(()=>{cleanup();reject(new Error("Мастер не подтвердил запрос за 30 секунд. Проверьте сообщение в чате; не повторяйте действие, пока его состояние не выяснено."));},30000);
    function cleanup(){clearTimeout(timer);Hooks.off("updateChatMessage",hook);}
    check(game.messages.get(message.id)??message);
  });
}
export function processRequest(message){
  if(authority()?.id!==game.user.id||!message.getFlag(ID,"request")||message.getFlag(ID,"status")!=="pending"||seen.has(message.id))return;
  // Capture immutable input now; later edits to the player's message cannot change the queued action.
  const payload=foundry.utils.deepClone(message.getFlag(ID,"request")),user=message.author;
  seen.add(message.id);
  enqueue(async()=>{
    if(authority()?.id!==game.user.id){seen.delete(message.id);return;}
    const ledger=game.settings.get(ID,"requests");
    if(ledger[message.id]){await message.update({[`flags.${ID}.status`]:"error",[`flags.${ID}.error`]:"Запрос был прерван. Мастеру нужно проверить открытые проверки и колоды перед повторением.",content:"<p>Прерванный запрос: требуется проверка мастером. Повторно автоматически не выполняется.</p>"});return;}
    // Fail closed after interruption: an already started request is never replayed automatically.
    ledger[message.id]="started";await game.settings.set(ID,"requests",ledger);
    try{await execute(user,payload);await message.update({[`flags.${ID}.status`]:"done",content:"<p>Карточное действие выполнено.</p>"});}
    catch(err){console.error(`${ID} | request ${message.id}`,err);await message.update({[`flags.${ID}.status`]:"error",[`flags.${ID}.error`]:err.message,content:`<p>Действие не завершено: ${e(err.message)}</p>`});}
  });
}
