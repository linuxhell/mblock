// SPDX-License-Identifier: GPL-3.0-only
import { builtInRules } from './fixes.js';
import { controlRules } from './core.js';
const FIELDS=new Set(['enabled','autoUpdate','intervalHours','genericCosmetic','fixes','youtube','sites','antiAdblockCoreRules']);
export function controlsOnly(patch){const keys=Object.keys(patch);return keys.length>0&&keys.every(key=>FIELDS.has(key));}
export function nextConfigurationTime(previous, now=Date.now()){
  return new Date(Math.max(now,(Date.parse(previous)||0)+1)).toISOString();
}
export function planControlChange(state, patch){
  if(!controlsOnly(patch)||state?.snapshot?.storageFormat!=='shared-v1'||!state.metadata)return null;
  const previous=state.snapshot,meta=state.metadata;
  const base=meta.stats.nativeRules-previous.extraRules.length;
  if(!Number.isInteger(base)||base<0||previous.extraRules.some((r,i)=>r.id!==base+i+1))throw Error('Configuração persistida inválida.');
  const settings={...previous.settings,...patch},at=nextConfigurationTime(previous.at);
  const extraRules=[...builtInRules(settings),...controlRules(settings)].map((rule,i)=>({...rule,id:base+i+1}));
  const next={...previous,settings,at,transactionId:crypto.randomUUID(),extraRules};
  const metadata={...meta,settings,at,sources:next.sources,stats:{...meta.stats,nativeRules:base+extraRules.length},hasPrevious:true};
  return {previous,next,metadata,base};
}
