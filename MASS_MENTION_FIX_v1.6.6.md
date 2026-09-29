# v1.6.6 — @everyone / @here Hard Ignore

Messages containing `@everyone` or `@here` are now a complete no-op for automatic bot systems.

The bot will not:
- react with emojis
- answer with `/ai`-style automatic AI
- trigger Support AI / external-ticket detection from that message
- run automatic moderation on that message
- translate it
- process it for Suggestions / Community systems
- process Counting reactions
- add it to Starboard due to later reactions
- create delete/audit output specifically from that message

Slash commands remain usable normally; this only applies to message-driven automations.
