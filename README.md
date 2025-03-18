# Soundgasm Extractor

This is a reworked Soundcloud extractor inspired from the original one at [discord-player/extractors](SoundCloudExtractor).

## Installation

```bash
npm install discord-player-soundcloud
```

## Usage

```js
const { Player } = require("discord-player");

const { SoundcloudExtractor } = require("discord-player-soundcloud");
// Or
import { SoundcloudExtractor } from "discord-player-soundcloud";

const player = new Player(client, {});

await player.extractors.register(SoundcloudExtractor, { /* options */ });
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| clientId | string | null | Your SoundCloud client ID |
| oauthToken | string | null | Your SoundCloud OAuth token |