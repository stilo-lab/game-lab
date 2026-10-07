'use strict';
const assert=require('node:assert/strict'),spec=require('./fixtures/permissions-preservation.json');
function previousMimicRelease(file,source){
  source=require('./setup_customization_preservation').previousPermissionsRelease(file,source);
  for(const {before,after}of [...(spec[file]?.edits||[])].reverse()){
    assert.equal(source.split(after).length-1,1,`Permission edit drift: ${file}`);source=source.replace(after,before);
  }
  return source;
}
module.exports={previousMimicRelease,spec};
