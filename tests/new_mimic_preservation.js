'use strict';
const assert=require('node:assert/strict');
const spec=require('./fixtures/new-mimic-preservation.json');
function previousPixelRelease(file,source){
  source=require('./mimic_host_preservation').previousNewMimicRelease(file,source);
  for(const {before,after}of [...(spec[file]?.edits||[])].reverse()){
    assert.equal(source.split(after).length-1,1,`New/Mimic update drift: ${file}`);source=source.replace(after,before);
  }
  return source;
}
module.exports={previousPixelRelease,spec};
