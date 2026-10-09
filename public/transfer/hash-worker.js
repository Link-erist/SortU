import {sha256} from '../vendor/sha256.js';
const hash=sha256.create();
self.onmessage=({data})=>{
  try {let result=null;if(data.type==='update')hash.update(new Uint8Array(data.bytes));else if(data.type==='digest')result=Array.from(hash.clone().digest(),b=>b.toString(16).padStart(2,'0')).join('');else throw new Error('Unknown hashing request.');self.postMessage({id:data.id,result});}
  catch(error){self.postMessage({id:data.id,error:error.message});}
};
