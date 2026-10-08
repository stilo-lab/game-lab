'use strict';
const assert=require('node:assert/strict');
const spec=require('./fixtures/mimic-host-preservation.json');
function previousNewMimicRelease(file,source){
  for(const {before,after}of [...(spec[file]?.edits||[])].reverse()){
    assert.equal(source.split(after).length-1,1,`Mimic host edit drift: ${file}`);source=source.replace(after,before);
  }
  return source;
}
module.exports={spec,previousNewMimicRelease};
