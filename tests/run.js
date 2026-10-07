'use strict';
require('./setup_customization.test');
require('./general_improvements.test');
require('./pixel_display_fix.test');
require('./new_actions.test');
require('./mimic_upgrade.test');
// Load the actual tests; no Discord login, HTTP server or API key is needed.
for(const file of ['bot_permissions','mimic_categories','mimic_party','mimic_audio','mimic_voice','mimic_quiet','new_assistant','mega_ai','pixel_characters','runtime_stability','ai_quality','pixel_gojo','server_setup_designs','youtube_integration','youtube_uploads'])require('./'+file+'.test');
