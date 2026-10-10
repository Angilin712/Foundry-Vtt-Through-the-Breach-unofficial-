import {t as ttbT,tr as ttbTr} from './localization.mjs';
import {ID,assert} from './rules.mjs';
import {request,actorFor} from './cards.mjs';
import {validateAP,walkPlan} from './turns.mjs';

// Only the active GM can mint a ticket. An option supplied by a player is not an authorization.
const tickets=new Map();
export const movementIsCombat=()=>game.combat?.started===true;
export function yardsPerUnit(units){
  const u=String(units??'').trim().toLowerCase();
  if(['yd','yds','yard','yards','ярд','ярды','ярдов'].includes(u))return 1;
  if(['ft','feet','foot','фут','футы','футов'].includes(u))return 1/3;
  if(['m','meter','meters','metre','metres','м','метр','метры','метров'].includes(u))return 1/0.9144;
  throw Error(ttbT('Для автоматической Ходьбы задайте единицы сцены: ярды, ft или m.'));
}
export function measuredWalkPlan(system,movement,units,difficult=false){
  const distance=Number(movement.passed.distance)+Number(movement.pending.distance);
  const cost=Number(movement.passed.cost)+Number(movement.pending.cost);
  assert(Number.isFinite(cost)&&cost>=distance-1e-6,ttbT('Стоимость пути не измерена; используйте обычную Ходьбу, а особое перемещение разрешает мастер.'));
  const scale=yardsPerUnit(units),paidDistance=cost*scale*(difficult?2:1);
  const plan=walkPlan(system,{distance:paidDistance});
  return {...plan,distance:distance*scale,paidDistance};
}
function cleanPath(path){
  assert(Array.isArray(path)&&path.length>0&&path.length<=1000,ttbT('Некорректный путь токена.'));
  return path.map(w=>{
    assert(Number.isFinite(w.x)&&Number.isFinite(w.y),ttbT('Некорректные координаты пути.'));
    return {x:w.x,y:w.y,...(Number.isFinite(w.elevation)?{elevation:w.elevation}:{}),...(typeof w.level==='string'?{level:w.level}:{}),checkpoint:w.checkpoint===true,action:'walk',explicit:true};
  });
}
const sameOrigin=(token,origin)=>origin&&['x','y','elevation'].every(k=>Number(token[k])===Number(origin[k]));

export function movementDocument(Base){return class BreachToken extends Base {
  async _preUpdateMovement(movement,options){
    if(await super._preUpdateMovement(movement,options)===false)return false;
    // Core strips custom options when continuing a path at a region checkpoint.
    const ticket=tickets.get(options.ttbWalkTicket)??[...tickets.values()].find(t=>t.token===this&&t.movementId&&(t.movementId===movement.id||movement.chain?.includes(t.movementId)));
    if(ticket&&game.user.isGM&&ticket.token===this){
      assert(movementIsCombat(),ttbT('Бой завершён; повторите перемещение вне боя без оплаты ОД.'));
      ticket.movementId=movement.id;
      const plan=measuredWalkPlan(this.actor.system,{passed:{distance:(ticket.distanceUsed??0)+movement.passed.distance,cost:(ticket.costUsed??0)+movement.passed.cost},pending:movement.pending},this.parent.grid.units,this.actor.getFlag(ID,'difficultWalk')===true);
      ticket.distanceUsed=(ticket.distanceUsed??0)+movement.passed.distance;
      ticket.costUsed=(ticket.costUsed??0)+movement.passed.cost;
      if(ticket.paid){ticket.plan=plan;return;}
      validateAP(this.actor,1);
      if(game.combat?.started&&game.combat.combatant?.tokenId)assert(game.combat.combatant.tokenId===this.id,ttbT('Сейчас ход другого токена.'));
      await this.actor.update({'system.ap.value':this.actor.system.ap.value-1});
      ticket.paid=true;ticket.plan=plan;return;
    }
    if(!this.actor||!movementIsCombat())return;
    if(game.user.isGM&&game.settings.get(ID,'gmFreeMovement')===true)return;
    if(movement.passed.distance+movement.pending.distance<=1e-8&&movement.origin.x===movement.destination.x&&movement.origin.y===movement.destination.y&&movement.origin.elevation===movement.destination.elevation)return;
    try{
      assert(!options.isUndo,ttbT('Отмена перемещения не возвращает ОД. Исправление позиции выполняет мастер в режиме свободной расстановки.'));
      assert(!this.actor.system.operationPending,ttbT('Предыдущее действие не завершено; дождитесь результата или обратитесь к мастеру.'));
      await request({op:'tokenWalk',actorUuid:this.actor.uuid,tokenUuid:this.uuid,origin:{x:this.x,y:this.y,elevation:this.elevation},waypoints:cleanPath([...movement.passed.waypoints,...movement.pending.waypoints])});
    }catch(error){ui.notifications.error(error.message);}
    // The authenticated GM request performs the move; discard this original update.
    return false;
  }
};}

export async function executeTokenWalk(user,p){
  assert(user?.active,ttbT('Пользователь не подключён.'));
  const token=await fromUuid(p.tokenUuid),actor=actorFor(user,p.actorId,p.actorUuid);
  assert(token?.documentName==='Token'&&token.actor?.uuid===actor.uuid&&token.testUserPermission(user,'OWNER'),ttbT('Нет доступа к этому токену.'));
  assert(token.parent?.id===canvas.scene?.id&&token.object,ttbT('Откройте сцену токена на клиенте мастера.'));
  assert(sameOrigin(token,p.origin),ttbT('Положение токена уже изменилось. Повторите измерение пути.'));
  assert(movementIsCombat(),ttbT('Бой не запущен или уже завершён; вне боя перемещайте токен свободно.'));
  assert(!actor.system.operationPending,ttbT('Предыдущее действие не завершено.'));
  validateAP(actor,1);
  if(game.combat?.started&&game.combat.combatant?.tokenId)assert(game.combat.combatant.tokenId===token.id,ttbT('Сейчас ход другого токена.'));
  const waypoints=cleanPath(p.waypoints),id=foundry.utils.randomID(),beforeAP=actor.system.ap.value;
  const ticket={token,paid:false};tickets.set(id,ticket);let completed=false,moved=false,refundBlocked=false;
  async function refund(){
    if(!ticket.paid||actor.system.ap.value===beforeAP)return;
    if(actor.system.ap.value!==beforeAP-1){refundBlocked=true;throw Error(ttbT('ОД изменены во время перемещения. Мастер должен сверить ресурс и снять блокировку операции.'));}
    await actor.update({'system.ap.value':beforeAP});
  }
  try{
    await actor.update({'system.operationPending':ttbT('Ходьба: проверка пути и перемещение токена')});
    // Core calculates terrain and wall constraints afresh on the GM canvas. Client costs are never trusted.
    const arrived=await token.move(waypoints,{ttbWalkTicket:id,animate:false,showRuler:true,constrainOptions:{ignoreWalls:false,ignoreCost:false}});
    moved=arrived===true||!sameOrigin(token,p.origin);
    if(!moved){
      await refund();
      throw Error(ttbT('Путь заблокирован: токен не перемещён, ОД сохранены.'));
    }
    assert(ticket.paid,ttbT('Перемещение не прошло проверку Ходьбы; мастер должен проверить позицию и ОД.'));
    const scale=yardsPerUnit(token.parent.grid.units),distance=ticket.distanceUsed*scale,cost=ticket.costUsed*scale*(actor.getFlag(ID,'difficultWalk')===true?2:1);
    await foundry.documents.ChatMessage.create({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),content:ttbTr`<p>Ходьба: ${distance.toFixed(2)} ярда; стоимость пути ${cost.toFixed(2)} ярда, −1 ОД.${arrived===false?ttbT(' Путь был остановлен.'):''} Выход из боя и опасную местность разрешает мастер.</p>`});
    completed=true;
  }catch(error){
    if(!moved&&sameOrigin(token,p.origin)){
      await refund();
    }else{
      throw Error(ttbTr`${error.message} Позиция изменилась: проверьте ОД и снимите блокировку операции в листе.`);
    }
    throw error;
  }finally{
    tickets.delete(id);
    // Preserve the lock for an interrupted, partially completed operation.
    if(!refundBlocked&&(!moved&&sameOrigin(token,p.origin)||completed))await actor.update({'system.operationPending':''});
  }
}
