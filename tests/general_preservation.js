'use strict';
const assert = require('node:assert/strict');
const spec = require('./fixtures/general-preservation.json');
function previousSetupRelease(file, source) {
  source = require('./pixel_fix_preservation').previousGeneralRelease(file, source);
  for (const { before, after } of [...(spec[file]?.edits || [])].reverse()) {
    assert.equal(source.split(after).length - 1, 1, `General update edit drift: ${file}`);
    source = source.replace(after, before);
  }
  return source;
}
module.exports = { previousSetupRelease, spec };
