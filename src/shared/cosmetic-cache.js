// SPDX-License-Identifier: GPL-3.0-only
export class CosmeticCache {
  constructor({maxEntries=64,maxBytes=512*1024,maxPending=32}={}) {
    this.maxEntries=maxEntries; this.maxBytes=maxBytes; this.maxPending=maxPending;
    this.entries=new Map(); this.pending=new Map(); this.bytes=0; this.revision=0;
  }
  clear() { this.entries.clear(); this.pending.clear(); this.bytes=0; this.revision++; }
  async load(key, loader) {
    const cached=this.entries.get(key);
    if(cached){this.entries.delete(key);this.entries.set(key,cached);return cached.value;}
    if(this.pending.has(key))return this.pending.get(key);
    const revision=this.revision,promise=Promise.resolve().then(loader);
    if(this.pending.size<this.maxPending)this.pending.set(key,promise);
    try {
      const value=await promise,bytes=128+2*(key.length+value.css.length);
      if(revision===this.revision&&bytes<=this.maxBytes){
        // When the pending queue is full, duplicate loads may finish separately.
        // Replacing that key must release its previous accounting first.
        const previous=this.entries.get(key);
        if(previous){this.bytes-=previous.bytes;this.entries.delete(key);}
        while(this.entries.size&&(this.entries.size>=this.maxEntries||this.bytes+bytes>this.maxBytes)){
          const oldest=this.entries.keys().next().value;this.bytes-=this.entries.get(oldest).bytes;this.entries.delete(oldest);
        }
        if(this.maxEntries>0){this.entries.set(key,{value,bytes});this.bytes+=bytes;}
      }
      return value;
    }finally{if(this.pending.get(key)===promise)this.pending.delete(key);}
  }
}
