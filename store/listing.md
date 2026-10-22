## Name

Remove AI Slop from Steam

## Summary

The manifest description (132 characters at most):

> Hide/blur/label Steam games that disclose AI-generated content.

## Description

```
Steam asks developers to disclose generative AI in their games. This extension reads those on every Steam store page and acts on that for you.

Each disclosure receives a level:
* Mostly AI-generated: AI made most of the art/sound/writing. Or the game makes content with AI while you play.
* Some AI content: some AI-made things in the game.
* AI tools only: code help/translation/store page art.

You customize the level to catch + what to do with those games:
* Hide them on the search/home page/Next Fest/sales/tag pages/recommendations.
* Blur their art.
* Only label them.

Please note that disclosures are self-reported. A 🐀 developer who keeps quiet about AI will not be filtered. The "level" is this extension's reading of free text. Keyword rules cover English + some Chinese/Japanese/Korean/Russian. Some calls WILL be wrong. Hover a label to read what the developer actually wrote. You're also free to contribute to improve accuracy.

Works in the Steam desktop client through Millennium and Extendium.

Collects nothing (privacy-first).
```

## Category

- Chrome Web Store: Lifestyle > Shopping
- addons.mozilla.org: Shopping

## Chrome privacy tab

Single purpose:

> Hide/blur/label games on the Steam store that disclose generative AI content.

Permissions:

- `storage`: keeps settings/always-shown games/a cache of disclosures. The cache saves asking Steam again on every page.
- Host `store.steampowered.com`: the content script finds games on Steam store pages and hides/blurs/labels them.
- Host `api.steampowered.com`: reads each game's AI disclosure from Steam's store API.

Remote code: no.

Data usage: none of the listed data types is collected.

## Firefox

- Data collection: none. The manifest says so in `data_collection_permissions`.
- Source code upload: not needed. Nothing is minified or bundled. `npm run build` copies `src` + writes the Firefox manifest.
- Add-on ID: `remove-ai-slop-from-steam@mewiof` (fixed after the first upload).
- License: MIT

## Images

- Icon: `src/icons/icon-128.png`
- Screenshots (1280x800):
    - `screenshot-1-label.png`
    - `screenshot-2-hide.png`
    - `screenshot-3-gate.png`
    - `screenshot-4-settings.png`
- Small promo tile (440x280): `promo-440x280.png`
