'use strict';
const assert=require('node:assert/strict'),spec=require('./fixtures/setup-customization-preservation.json');
function previousPermissionsRelease(file,source) {
  source=require('./general_preservation').previousSetupRelease(file,source);
  for (const {before,after} of [...(spec[file]?.edits || [])].reverse()) {
    assert.equal(source.split(after).length-1,1,`Server setup edit drift: ${file}`);source=source.replace(after,before);
  }
  return source;
}
module.exports={previousPermissionsRelease,spec};
