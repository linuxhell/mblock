// SPDX-License-Identifier: GPL-3.0-only
export function cosmeticIndex(items) {
  const index=new Map();
  for(const item of items){
    const domains=item.include.length?item.include:[item.exception?'!global':'*'];
    for(const domain of domains){
      if(!index.has(domain))index.set(domain,[]);
      // This bucket is only read for this domain or its descendants. Keeping
      // every other included domain here duplicates long lists without changing
      // selector matching. Original filters remain intact in the snapshot.
      index.get(domain).push(item.include.length>1?{...item,include:[domain]}:item);
    }
  }
  return index;
}
export function cosmeticKeys(host,generic=true){
  const parts=host.split('.'),keys=generic?['*','!global']:['!global'];
  while(parts.length>=2){keys.push(parts.join('.'));parts.shift();}
  return keys;
}
