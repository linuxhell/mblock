import { test } from 'node:test';import assert from 'node:assert/strict';
import { STRINGS, translate, LOCALES } from '../src/ui/translations.js';
test('every interface string has three complete translations and stable placeholders',()=>{
 assert.deepEqual(Object.keys(LOCALES),['en','pt_BR','zh_CN']);const keys=new Set();
 for(const row of STRINGS){assert.equal(row.length,3);assert.ok(!keys.has(row[0]),row[0]);keys.add(row[0]);for(const value of row)assert.ok(typeof value==='string'&&value.length>0);const placeholders=x=>[...x.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort();assert.deepEqual(placeholders(row[1]),placeholders(row[0]));assert.deepEqual(placeholders(row[2]),placeholders(row[0]));}
});
test('selected locale controls labels and substitutions',()=>{
 assert.equal(translate('Doar via PayPal','en'),'Donate with PayPal');assert.equal(translate('Doar via PayPal','zh_CN'),'通过 PayPal 捐赠');assert.equal(translate('Configuração instalada: {time}','en',{time:'today'}),'Configuration installed: today');
});
