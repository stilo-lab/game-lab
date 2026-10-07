'use strict';
const assert=require('node:assert/strict');const spec=require('./fixtures/mimic-preservation.json');
function previousMegaRelease(file,source){
  source=require('./permissions_preservation').previousMimicRelease(file,source);
  for(const {before,after}of spec[file]?.edits||[]){assert.equal(source.split(after).length-1,1,`Mimic edit drift: ${file}`);source=source.replace(after,before);}
  return source;
}
module.exports={previousMegaRelease,spec};
