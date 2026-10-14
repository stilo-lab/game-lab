'use strict';
const assert=require('node:assert/strict'),spec=require('./fixtures/video-fixes-preservation.json');
function previousAiBoostRelease(file,source) {
  for(const {before,after}of [...(spec[file]?.edits || [])].reverse()) {
    assert.equal(source.split(after).length-1,1,`Video bug fix drift: ${file}`);source=source.replace(after,before);
  }
  return source;
}
module.exports={spec,previousAiBoostRelease};
