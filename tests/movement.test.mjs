import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {reset,actor,gm,player,other,ID} from './harness.mjs';
const {movementDocument,measuredWalkPlan,yardsPerUnit,executeTokenWalk}=await import('../through-the-breach/scripts/movement.mjs');
beforeEach(reset);
test('Outside combat, dramatic time never restricts player movement or charges AP',async()=>{
  for(const combat of [null,{started:false}]){
    const f=fixture();game.combat=combat;game.user=player;game.settings.set(ID,'dramaticTime',true);
    f.a.system.ap.value=0;f.a.system.operationPending='Unrelated interruption';
    const movement={...path(100),origin:{x:0,y:0,elevation:0},destination:{x:100,y:0,elevation:0}};
    assert.equal(await f.token._preUpdateMovement(movement,{}),undefined);
    assert.equal(f.a.system.ap.value,0);assert.equal(game.messages.size,0);
  }
});
test('A queued paid-walk request after combat ends cannot deduct AP',async()=>{
  const f=fixture();game.combat=null;game.settings.set(ID,'dramaticTime',true);
  await assert.rejects(()=>executeTokenWalk(player,f.p),/Бой не запущен/);
  assert.equal(f.a.system.ap.value,2);assert.equal(f.token.x,0);
});
const path=(distance,cost=distance)=>({passed:{distance,cost,waypoints:[{x:100,y:0}]},pending:{distance:0,cost:0,waypoints:[]}});
function fixture({distance=2,cost=distance,blocked=false,fail=false,loop=false,continuation=false,partialFailure=false,manualAP=null}={}){
  const a=actor();a.getFlag=()=>false;game.settings.set(ID,'dramaticTime',true);
  globalThis.canvas={scene:{id:'scene'}};
  class Base{
    async _preUpdateMovement(){}
    async move(waypoints,options){
      if(continuation){
        await this._preUpdateMovement({id:'first',chain:[],passed:{distance:1,cost:1,waypoints:[]},pending:{distance:distance-1,cost:cost-1,waypoints:[]}},options);
        // The native core strips ttbWalkTicket and creates a new movement ID for the continuation.
        await this._preUpdateMovement({...path(distance-1,cost-1),id:'second',chain:['first']},{});
      }else await this._preUpdateMovement(path(distance,cost),options);
      if(manualAP!==null)a.system.ap.value=manualAP;
      if(fail)throw Error('Database failed');
      if(blocked)return false;
      if(!loop)Object.assign(this,waypoints.at(-1));
      if(partialFailure)throw Error('Interrupted after position update');
      return true;
    }
  }
  const Token=movementDocument(Base),token=Object.assign(new Token(),{id:'token',uuid:'Scene.scene.Token.token',documentName:'Token',actor:a,x:0,y:0,elevation:0,object:{},parent:{id:'scene',grid:{units:'ярд'}},testUserPermission:u=>a.testUserPermission(u)});
  game.combat={started:true,combatant:{actor:a,tokenId:token.id},getFlag:()=>null};
  globalThis.fromUuid=async uuid=>uuid===token.uuid?token:undefined;
  const p={actorUuid:a.uuid,tokenUuid:token.uuid,origin:{x:0,y:0,elevation:0},waypoints:[{x:100,y:0}],distance:0,cost:0};
  return {a,token,p};
}
test('Native path includes difficult portions only, and supports scene unit conversion',()=>{
  const a=actor();a.system.aspects.speed=4;
  assert.equal(measuredWalkPlan(a.system,path(4,6),'ярд').paidDistance,6);
  assert.equal(measuredWalkPlan(a.system,path(12),'ft').distance,4);
  assert.equal(yardsPerUnit('м'),1/0.9144);
  assert.throws(()=>yardsPerUnit('клетки'));
  assert.equal(measuredWalkPlan(a.system,path(3),'ярд',true).paidDistance,6);
  assert.throws(()=>measuredWalkPlan(a.system,path(4),'ярд',true));
});
test('GM recomputes path cost and pays exactly once before changing coordinates',async()=>{
  const {a,token,p}=fixture();await executeTokenWalk(player,p);
  assert.equal(a.system.ap.value,1);assert.equal(token.x,100);assert.equal(a.system.operationPending,'');
  await assert.rejects(()=>executeTokenWalk(player,p));assert.equal(a.system.ap.value,1);
});
test('Overlong or insufficient-AP movement leaves coordinates and AP unchanged',async()=>{
  let f=fixture({distance:10});await assert.rejects(()=>executeTokenWalk(player,f.p));assert.equal(f.token.x,0);assert.equal(f.a.system.ap.value,2);
  f=fixture();f.a.system.ap.value=0;await assert.rejects(()=>executeTokenWalk(player,f.p));assert.equal(f.token.x,0);
});
test('Path cost from terrain cannot be overridden by a client-supplied free cost',async()=>{
  const f=fixture({distance:3,cost:6});await assert.rejects(()=>executeTokenWalk(player,f.p));assert.equal(f.a.system.ap.value,2);
});
test('Blocked and failed database moves refund payment when position did not change',async()=>{
  for(const options of [{blocked:true},{fail:true}]){
    const f=fixture(options);await assert.rejects(()=>executeTokenWalk(player,f.p));assert.equal(f.a.system.ap.value,2);assert.equal(f.token.x,0);assert.equal(f.a.system.operationPending,'');
  }
});
test('A completed loop is still a paid Walk even when it ends at the origin',async()=>{
  const f=fixture({loop:true});await executeTokenWalk(player,f.p);assert.equal(f.a.system.ap.value,1);assert.equal(f.token.x,0);
});
test('Native continuation without custom options retains authorization and does not pay twice',async()=>{
  const f=fixture({distance:3,continuation:true});await executeTokenWalk(player,f.p);assert.equal(f.a.system.ap.value,1);assert.equal(f.token.x,100);
});
test('Partial movement failure keeps payment and recovery lock instead of refunding a moved token',async()=>{
  const f=fixture({partialFailure:true});await assert.rejects(()=>executeTokenWalk(player,f.p));assert.equal(f.a.system.ap.value,1);assert.equal(f.token.x,100);assert.match(f.a.system.operationPending,/Ходьба/);
});
test('Refund does not overwrite a GM edit to AP during a failed move',async()=>{
  const f=fixture({blocked:true,manualAP:0});await assert.rejects(()=>executeTokenWalk(player,f.p));assert.equal(f.a.system.ap.value,0);assert.match(f.a.system.operationPending,/Ходьба/);
});
test('Original loop interceptor does not bypass authentication when coordinates coincide',async()=>{
  const f=fixture();f.a.system.operationPending='Guard';game.user=player;ui.notifications.error=()=>{};
  const m={...path(2),origin:{x:0,y:0,elevation:0},destination:{x:0,y:0,elevation:0}};
  assert.equal(await f.token._preUpdateMovement(m,{ttbWalkTicket:'forged'}),false);assert.equal(f.a.system.ap.value,2);
});
test('Foreign actors, other turns and another token of the same actor cannot move',async()=>{
  const f=fixture();await assert.rejects(()=>executeTokenWalk(other,f.p));
  game.combat={started:true,combatant:{actor:f.a,tokenId:'another-token'},getFlag:()=>null};
  await assert.rejects(()=>executeTokenWalk(player,f.p));assert.equal(f.token.x,0);assert.equal(f.a.system.ap.value,2);
});
test('Unconsciousness, operation lock and inactive GM canvas prevent paid movement',async()=>{
  for(const mutate of [f=>f.a.system.unconscious=true,f=>f.a.system.operationPending='Interrupted',f=>canvas.scene.id='elsewhere']){
    const f=fixture();mutate(f);await assert.rejects(()=>executeTokenWalk(player,f.p));assert.equal(f.token.x,0);assert.equal(f.a.system.ap.value,2);
  }
});
test('Forged GM ticket is not a bypass; narrative movement is free',async()=>{
  const f=fixture();game.combat=null;game.settings.set(ID,'dramaticTime',false);game.user=player;
  assert.equal(await f.token._preUpdateMovement({...path(2),origin:{x:0,y:0,elevation:0},destination:{x:100,y:0,elevation:0}},{ttbWalkTicket:'forged'}),undefined);
  assert.equal(f.a.system.ap.value,2);
  game.user=gm;game.combat={started:true,combatant:{actor:f.a,tokenId:f.token.id},getFlag:()=>null};game.settings.set(ID,'dramaticTime',true);game.settings.set(ID,'gmFreeMovement',true);
  assert.equal(await f.token._preUpdateMovement({...path(2),origin:{x:0,y:0,elevation:0},destination:{x:100,y:0,elevation:0}},{}),undefined);
  assert.equal(f.a.system.ap.value,2);
});
test('Malformed paths and scene units fail before any token change',async()=>{
  const f=fixture();f.p.waypoints=[{x:Infinity,y:0}];await assert.rejects(()=>executeTokenWalk(player,f.p));
  f.p.waypoints=[{x:100,y:0}];f.token.parent.grid.units='unknown';await assert.rejects(()=>executeTokenWalk(player,f.p));assert.equal(f.a.system.ap.value,2);assert.equal(f.token.x,0);
});
