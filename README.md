# llw-browser

## v48 – prop-shadow cleanup, slower day, staged cloud shadows

- Doubled `turnsPerHour` from 10 to 20 so the full day takes twice as many turns and lighting changes breathe more slowly.
- Removed long projected/cast shadows from fallen logs and log-bridge crossings; they now use grounded contact shadows only.
- Reworked low foliage projected shadows so bushes and bramble patches use short attached cast shadows instead of detached floating blobs.
- Added a first staged cloud-shadow pass: broad, slow, cool-toned drifting shadows that lightly dim the world during daylight.
