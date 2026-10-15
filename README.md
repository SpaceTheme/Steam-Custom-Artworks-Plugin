# Steam-Custom-Artworks

![Banner](https://raw.githubusercontent.com/SpaceTheme/Steam-Custom-Artworks/main/.github/assets/banner.webp)

One style for your whole Steam library. This Millennium plugin replaces the covers, banners and logos of your games with [Steam-Custom-Artworks](https://github.com/SpaceTheme/Steam-Custom-Artworks): artworks that all follow the same clean design, so your library finally looks consistent instead of a mix of random styles.

The plugin installs the artworks for the games you own and keeps them up to date automatically. Missing a game? Request it with a right-click in your library.

## ✨ Features

- **Automatic updates** – artworks for the games in your library are installed when Steam starts and checked for updates every 6 hours.
- **Only your games** – the plugin only installs artworks for games you own, not the whole collection.
- **Pick your color** – choose a color theme for all artworks, with a live preview from one of your own games before you apply it. The plugin creates the artworks on your PC, so switching colors only takes a few minutes.
- **No restart needed** – artworks are applied through Steam's own custom artwork feature and show up right away.
- **Proper game page banner** – the artwork is shown completely on the game page and the downloads page, framed in your chosen color.
- **Progress notification** – a Steam notification with a progress bar shows the progress and closes itself when it's done.
- **Request from your library** – right-click a game and choose **Request artwork**, or **Change artwork** if it already has one.
- **Steam-style settings** – pick a color, turn automatic updates on or off, check for updates, reinstall everything or restore Steam's default artwork.

## 📥 Installation

1. Install [Millennium](https://steambrew.app) (version 3.4.0 or newer).
2. Install the **Steam-Custom-Artworks** plugin and enable it in Millennium's plugin settings.
3. Restart Steam. The plugin installs the artworks for your games (about 3 minutes for 700 games) and shows the progress in a Steam notification.

### Without Millennium

On **[spacetheme.net/artworks](https://spacetheme.net/artworks)** you can enter your Steam profile and download the artworks of only the games you own as a `grid.zip`. That's a one-time download: no automatic updates, no color options, no game page banner fix, and new artworks need a new download. The complete pack with every artwork and the manual install steps are in the [artwork repository](https://github.com/SpaceTheme/Steam-Custom-Artworks#-installation).

## ⚙️ Settings

Open the plugin in Millennium to find these settings:

| Setting | What it does |
|---|---|
| **Installed artworks** | How many artworks for your library are installed, and when the plugin last checked |
| **Storage used** | How much disk space the artworks take up |
| **Artwork color** | Pick one of the color themes; every entry shows a small preview made from one of your games |
| **Preview** | Cover, wide capsule and banner side by side in the selected color, before anything is changed |
| **Apply color** | Creates every artwork of your library again in the selected color |
| **Update artworks automatically** | Install new and changed artworks on Steam start and every 6 hours |
| **Check for updates** | Look for new artworks right now |
| **Reinstall all artworks** | Create the artworks for every game in your library again |
| **Request an artwork** | Opens the request form on GitHub |
| **Remove all artworks** | Restores Steam's default artwork for every game the plugin changed (asks for confirmation first) |

## 🐞 Bugs and ideas

Found a bug or have an idea for the plugin? [Open an issue](https://github.com/SpaceTheme/Steam-Custom-Artworks-Plugin/issues/new/choose). Artwork requests go to the [artwork repository](https://github.com/SpaceTheme/Steam-Custom-Artworks/issues/new?template=ARTWORK.yml).

## 🗳️ Request or replace an artwork

- **In Steam:** right-click a game in your library and choose **Request artwork** (no artwork yet) or **Change artwork** (replace the current one). The request form opens with the game's App ID already filled in.
- **On GitHub:** [open the request form](https://github.com/SpaceTheme/Steam-Custom-Artworks/issues/new?template=ARTWORK.yml) yourself.

You only need the game's App ID and a hero image from [SteamGridDB](https://www.steamgriddb.com). A bot checks your request within a minute and tells you if anything is missing. Once the artwork is added, the plugin installs it on its next check. The full guide is in the [artwork repository](https://github.com/SpaceTheme/Steam-Custom-Artworks#%EF%B8%8F-request-or-replace-an-artwork).

## ❓ FAQ

**How does the plugin create the artworks?**
The [artwork repository](https://github.com/SpaceTheme/Steam-Custom-Artworks) only contains the source image and the game's details. The plugin draws the artworks from them on your PC with the same design template the project uses, in the color you picked.

**Which games get an artwork?**
Every game in the collection that you own. The plugin settings show how many that are for your library. Non-Steam games are not supported.

**Does the plugin replace artwork I set myself?**
Yes, for games that have an artwork in the collection. Use **Remove all artworks** in the settings to go back to Steam's default artwork.

**When do new artworks arrive?**
As soon as a request is processed. With automatic updates on, the plugin checks when Steam starts and every 6 hours, or click **Check for updates** in the settings.

**Where can I get help?**
Join the [Discord server](https://discord.spacetheme.net).

## 🛠️ Building from source

Requires [Bun](https://bun.com) and a running Steam with Millennium.

```bash
bun install     # installs starlight and generates the type definitions in .millennium/
bun run build   # builds and installs into your local Millennium
bun run dev     # rebuilds and restarts the plugin on every change
```

Then enable **Steam-Custom-Artworks** in Millennium's plugin settings.
