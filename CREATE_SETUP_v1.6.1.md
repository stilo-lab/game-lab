# v1.6.1 – /create + Setup Permissions

## /create
- Shows only currently missing setup channels.
- Select one or multiple channels.
- Creates only the selected channels.
- Runs Smart Setup afterwards so the newly created channels receive their panels/configuration.
- Requires Administrator or Manage Channels for the invoking Discord member.
- The bot itself needs Administrator or Manage Channels.

## /setup
- Still creates no channels.
- Bot owner (`OWNER_ID`) may always run `/setup`, even without an Administrator role on that guild.
- Other members may run it with Administrator or Manage Channels.
- Refresh and missing-channel info use the same permission logic.
