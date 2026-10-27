# Still Online

An interactive Mojave roadside outpost by xD00g and Nebulys.

[Explore the outpost](https://mojave.nebulys.net/)

Restart the generator, use the CRT terminal, reconnect the server racks, tune a
shortwave radio, or drift through the desert Milky Way. A movable work light
reveals maintenance marks. Dust, distant headlights, and a storm beyond the
ridge occasionally pass through. Sound and motion can be switched off.

## Run locally

Install Node.js 22 or later, then run:

```sh
npm start
```

Open http://127.0.0.1:4190/. No dependencies or build step are required.

## Explore

- **Radio:** turn the tuning knob, use its arrow keys or fine-tune slider, or
  select a known frequency. 6.20 MHz carries a fictional weather bulletin,
  7.45 MHz an original synthesized instrumental, and 9.15 MHz a distant voice.
  Listen enables sound; spoken bulletins are a separate opt-in and require a
  local English speech voice. Every transmission also has a text version.
- **Work light:** sweep with a pointer or touch, or move with the arrow keys.
  Escape puts it down. On phones it temporarily fits the whole station.
- **Relay repair:** enter `diagnose` in the terminal, then read the maintenance
  records with `logs` and `cat notes/relay-wiring.txt`. Repatch RELAY-01 to port
  02, restart that machine, wait for it to boot, and run `ping relay`. The
  activity is optional and only affects this browser tab. `repair reset`
  resets it without changing the other machines.
- **Desert events:** occasional gusts, distant headlights, and soft lightning
  run while the scene is visible and motion is enabled. The terminal's
  `weather` command lists cues you can request, then watch after closing it.
  Effects pause during dialogs and generator recovery, and respect reduced
  motion. They are authored scenery, not live weather data.

All operator records, replies, frequencies, and equipment behavior are fiction.
The artwork needs no account, server connection, or real network commands.

## Source

- `web/` contains the website, rendered scene assets, animation and audio code.
- `scripts/serve.cjs` runs the local preview server.
- `licenses/` contains the bundled font license notices.

The browser scene uses rendered imagery with interactive JavaScript layers.
The editable Blender and Godot projects are not part of this repository.

To host it, serve `web/` with any static web server. Update the canonical URL,
sitemap, social metadata and analytics configuration for your own deployment.
The official site uses Google Analytics and a separate private stats service.
Tracking is restricted to the official hostname and honors DNT/GPC; the private
stats backend is not included and is not needed to run the scene.

## Rights

Copyright 2026 xD00g / Nebulys. This is a public source repository; no license to
reuse or redistribute the code, artwork or branding is granted. Bundled fonts
retain their own licenses in `licenses/`.
