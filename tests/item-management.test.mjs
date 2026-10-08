import test from 'node:test';
import assert from 'node:assert/strict';
import {actor,reset} from './harness.mjs';
import {removeRecord} from '../through-the-breach/scripts/item-management.mjs';
import {defaultArtwork,itemArtwork,refreshDefaultArtwork} from '../through-the-breach/scripts/item-art.mjs';

function fixture(){reset();const a=actor();a.items.set('record',{id:'record',name:'Запись'});a.deleteEmbeddedDocuments=async(type,ids)=>{assert.equal(type,'Item');for(const id of ids)a.items.delete(id);};return a;}
test('Deleting equipment removes the entire record without refunding currency',async()=>{
 const a=fixture(),scrip=a.system.scrip;await removeRecord(a,'record');assert.equal(a.items.size,0);assert.equal(a.system.scrip,scrip);
 await assert.rejects(removeRecord(a,'record'),/уже удалена/);
});
test('An observer cannot delete a record',async()=>{
 const a=fixture();a.isOwner=false;await assert.rejects(removeRecord(a,'record'),/владелец/);assert.equal(a.items.size,1);
});
test('Deleting the active grimoire clears attunement selection without freeing dependent magic',async()=>{
 const a=fixture();a.system.activeGrimoire='record';a.items.set('spell',{id:'spell',system:{grimoireId:'record'}});
 await removeRecord(a,'record');assert.equal(a.system.activeGrimoire,'');assert.equal(a.items.get('spell').system.grimoireId,'record');
});
test('Deleting a pursuit removes its active reference and progress but retains other pursuits',async()=>{
 const a=fixture();a.system.currentPursuitId='record';a.system.pursuitProgress=[{id:'record',step:2},{id:'other',step:3}];
 await removeRecord(a,'record');assert.equal(a.system.currentPursuitId,'');assert.deepEqual(a.system.pursuitProgress,[{id:'other',step:3}]);
});
test('Artwork distinguishes weapon, grimoire and magic, and preserves a custom thumbnail',()=>{
 const gun={name:'ВМФ Колиера',type:'equipment',system:{isWeapon:true,skill:'pistol'}};
 const spell={name:'Исцеление',type:'magic',system:{magicKind:'magia'}};
 assert.notEqual(defaultArtwork(gun),defaultArtwork(spell));assert.match(defaultArtwork({type:'magic',system:{magicKind:'grimoire'}}),/book-worn/);
 assert.equal(itemArtwork({...spell,img:'worlds/my-world/custom.webp'}),'worlds/my-world/custom.webp');
});
test('An artwork migration failure restores compendium locking and does not mark the migration complete',async()=>{
 reset();const calls=[],pack={collection:'through-the-breach.magic',documentName:'Item',locked:true,getDocuments:async()=>[{id:'x',type:'magic',name:'Исцеление',img:'icons/svg/book.svg'}],configure:async c=>{calls.push(c.locked);pack.locked=c.locked;},documentClass:{updateDocuments:async()=>{throw Error('write failed');}}};
 game.packs=[pack];await assert.rejects(refreshDefaultArtwork(),/write failed/);assert.deepEqual(calls,[false,true]);assert.equal(pack.locked,true);assert.notEqual(game.settings.get('through-the-breach','artworkVersion'),1);
});
