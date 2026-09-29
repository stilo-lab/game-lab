# YouTube Upload Ping – v1.7.2

## Commands

### `/youtube add`
- `link`: YouTube channel URL (`https://youtube.com/@handle`, `/channel/UC...`, etc.)
- `kanal`: Discord text/announcement channel
- `ping`: optional role to mention on every new upload

The bot resolves the YouTube channel ID, reads the official YouTube Atom/RSS uploads feed, and stores all current feed entries as already seen. That means **old uploads are not spammed** when you first add a channel.

### `/youtube list`
Shows every monitored YouTube channel and its `YT-X` ID.

### `/youtube remove id:YT-X`
Removes that subscription.

### `/youtube test id:YT-X`
Posts the latest upload as a test notification without changing normal new-upload detection.

### `/youtube check`
Runs an immediate check instead of waiting for the next polling interval.

## Videos + Shorts
YouTube Shorts are uploads on the channel and are included by the YouTube channel upload feed. The notification is intentionally labeled **“Neues Video / Short”** so both types are handled without depending on fragile HTML classification.

## Poll interval
Default: every 120 seconds.
Optional Railway variable:

`YOUTUBE_POLL_SECONDS=120`

Minimum is 60 seconds.

## No API key required
This system uses YouTube's public channel upload feed, so you do **not** need a YouTube Data API key.
