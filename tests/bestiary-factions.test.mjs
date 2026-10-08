import test from 'node:test';
import assert from 'node:assert/strict';
import {FACTIONS,factionFor,tokenFrame} from '../through-the-breach/scripts/bestiary-factions.mjs';

test('explicit Neverborn overrides undead characteristics',()=>{
  for(const faction of ['neverborn','Neverborn','Newerborn','Нерождённые'])
    assert.equal(factionFor({faction,tags:'Undead, Beast'}),'neverborn');
  assert.equal(factionFor({tags:'Neverborn, Undead'}),'neverborn');
});
test('Resurrectionists and undead use green, Neverborn undead use purple',()=>{
  assert.equal(factionFor({faction:'Воскрешатели',tags:'Living'}),'resurrectionists');
  assert.equal(factionFor({tags:'Undead, Nephilim'}),'neverborn');
  assert.equal(factionFor({tags:'Нежить'}),'resurrectionists');
  assert.equal(factionFor({book:'book-13',page:375,tags:'Нежить, Зверь, Феи'}),'neverborn');
  assert.equal(FACTIONS.neverborn.color,'#8844bb');
  assert.equal(FACTIONS.resurrectionists.color,'#43a657');
});
test('core faction sections override generic construct and living tags',()=>{
  assert.equal(factionFor({book:'book-13',page:328,tags:'Конструкт'}),'guild');
  assert.equal(factionFor({book:'book-13',page:358,tags:'Живой'}),'resurrectionists');
  assert.equal(factionFor({tags:'Living, Beast'}),'neutral');
});
test('token frames embed portraits and reject external or injected URLs',()=>{
  const svg=tokenFrame({portrait:'data:image/png;base64,aGVsbG8=',faction:'neverborn'});
  assert.match(svg,/fill="#8844bb"/);assert.match(svg,/clipPath/);assert.match(svg,/data:image\/png;base64/);
  for(const portrait of ['https://example.test/image.png','" onload="alert(1)',''])
    assert.throws(()=>tokenFrame({portrait}));
});
