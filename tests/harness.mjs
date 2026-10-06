// Test double for Foundry document persistence, not a replacement for a real world smoke test.
// TypeDataModel and validation below are loaded from the locally installed v14 engine.
import {pathToFileURL} from 'node:url';
export const engine=process.env.FOUNDRY_APP??'C:/Program Files/Foundry Virtual Tabletop/resources/app';
await import(pathToFileURL(`${engine}/common/server.mjs`).href);
export const {BreachActorModel}=await import('../through-the-breach/scripts/models.mjs');
export const {ID}=await import('../through-the-breach/scripts/rules.mjs');
let serial=0;
const id=()=>String(++serial).padStart(16,'0');
export const clone=o=>structuredClone(o);
class Collection extends Map {
  [Symbol.iterator](){return this.values();}
  get contents(){return [...this.values()];}
  find(fn){return this.contents.find(fn);}filter(fn){return this.contents.filter(fn);}map(fn){return this.contents.map(fn);}some(fn){return this.contents.some(fn);}
  forEach(fn){this.contents.forEach(fn);}
}
class Doc {
  constructor(data){Object.assign(this,clone(data));this.id??=id();this.flags??={};}
  getFlag(scope,key){return this.flags[scope]?.[key];}
  async setFlag(scope,key,value){this.flags[scope]??={};this.flags[scope][key]=clone(value);return this;}
  async update(data){for(const [k,v] of Object.entries(data)){if(k.includes('.'))foundry.utils.setProperty(this,k,clone(v));else this[k]=clone(v);}return this;}
}
class Card extends Doc {get origin(){return game.cards.get(this.originId);}}
export class MockCards extends Doc {
  constructor(data){const cards=data.cards??[];super({...data,cards:[]});this.cards=new Collection();cards.forEach(c=>{const card=new Card({...c,drawn:false,originId:this.id});this.cards.set(card.id,card);});}
  static async create(data){const doc=new this(data);game.cards.set(doc.id,doc);return doc;}
  get availableCards(){return this.cards.filter(c=>this.type!=='deck'||!c.drawn);}
  testUserPermission(user){return user.isGM||this.ownership[user.id]>=2;}
  async shuffle(){const order=this.cards.contents.toReversed();order.forEach((c,i)=>{c.sort=i;});return this;}
  async pass(to,ids){const created=[];for(const key of ids){const c=this.cards.get(key);if(!c)throw Error('Missing card '+key);if(this.type==='deck'&&c.drawn)throw Error('Double draw');
    if(to.id===c.originId){to.cards.get(key).drawn=false;}
    else {const copy=new Card({...clone({...c}),id:c.id,drawn:true,sort:to.cards.size+1000});to.cards.set(copy.id,copy);created.push(copy);}
    if(this.type==='deck')c.drawn=true;else this.cards.delete(key);
  }return created;}
  async draw(from,count){const chosen=from.availableCards.toSorted((a,b)=>a.sort-b.sort).slice(0,count);if(chosen.length!==count)throw Error('Not enough cards');return from.pass(this,chosen.map(c=>c.id));}
}
export class MockMessage extends Doc {
  static getSpeaker({actor}){return {actor:actor.id};}
  static async create(data){const doc=new this(data);doc.author=game.user;game.messages.set(doc.id,doc);return doc;}
}
export const gm={id:'gamemaster000001',isGM:true,active:true},player={id:'player0000000001',isGM:false,active:true},other={id:'player0000000002',isGM:false,active:true};
export function actor(name='Анна',type='fated',owner=player){
  const model=new BreachActorModel();model.prepareDerivedData();
  const doc={id:id(),documentName:'Actor',name,type,system:model,items:new Collection(),apps:{},isOwner:true,testUserPermission:u=>u.isGM||u.id===owner.id};
  doc.update=async data=>{for(const [k,v] of Object.entries(data))foundry.utils.setProperty(doc,k,clone(v));return doc;};
  doc.uuid=`Actor.${doc.id}`;game.actors.set(doc.id,doc);return doc;
}
export function reset(){
  globalThis.game={user:gm,cards:new Collection(),messages:new Collection(),actors:new Collection(),combats:new Collection(),users:new Collection([[gm.id,gm],[player.id,player],[other.id,other]]),settings:{values:new Map(),get(s,k){return clone(this.values.get(`${s}.${k}`)??{});},async set(s,k,v){this.values.set(`${s}.${k}`,clone(v));}}};game.users.activeGM=gm;
  globalThis.fromUuidSync=uuid=>game.actors.find(a=>a.uuid===uuid);
  foundry.documents={...foundry.documents,Cards:MockCards,ChatMessage:MockMessage};
  globalThis.ui={notifications:{error:console.error,warn:console.warn,info:()=>{}}};
  globalThis.Hooks={on:()=>1,off:()=>{}};
}
reset();
export function setTop(deck,values){let sort=0;for(const value of values){const c=deck.availableCards.find(c=>c.value===value&&!c._ordered);if(!c)throw Error(`Missing value ${value}`);c.sort=sort++;c._ordered=true;}for(const c of deck.availableCards){if(!c._ordered)c.sort=sort++;delete c._ordered;}}
