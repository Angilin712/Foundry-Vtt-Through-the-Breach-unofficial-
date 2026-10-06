import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdtemp,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const require=createRequire('C:/Program Files/Foundry Virtual Tabletop/resources/app/package.json');
const {ClassicLevel}=require('classic-level');
test('Every declared compendium contains native records matching the reviewed sources',async()=>{
 const manifest=JSON.parse(await readFile('through-the-breach/system.json','utf8'));
 const sources=JSON.parse(await readFile('through-the-breach/data/pack-sources.json','utf8'));
 const temp=await mkdtemp(join(tmpdir(),'ttb-packs-'));
 try{for(const pack of manifest.packs){
  const path=join(temp,pack.name);await cp(resolve('through-the-breach',pack.path),path,{recursive:true});
  const db=new ClassicLevel(path,{keyEncoding:'utf8',valueEncoding:'json'});await db.open();
  try{const sub=db.sublevel(pack.type==='Macro'?'macros':'items',{keyEncoding:'utf8',valueEncoding:'json'});const actual=await sub.iterator().all();assert.equal(actual.length,sources[pack.name].length);for(const [key,value] of actual){assert.equal(value._id,key);assert.deepEqual(value,sources[pack.name].find(d=>d._id===key));}}finally{await db.close();}
 }}finally{assert.ok(resolve(temp).startsWith(resolve(tmpdir())+ '\\'));await rm(temp,{recursive:true,force:true});}
});
