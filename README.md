# Still Online

An interactive Mojave roadside outpost by xD00g and Nebulys.

[Explore the outpost](https://mojave.nebulys.net/)

Restart the generator, use the CRT terminal, reconnect the server racks, or drift
through the desert Milky Way. Sound and motion can be switched off.

## Run locally

Install Node.js 22 or later, then run:

```sh
npm start
```

Open http://127.0.0.1:4190/. No dependencies or build step are required.

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
