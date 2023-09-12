# Modules for Obsidian [![release](https://img.shields.io/github/v/release/polyipseity/obsidian-modules)][latest release] [![Obsidian downloads](https://img.shields.io/badge/dynamic/json?logo=Obsidian&color=%238b6cef&label=downloads&query=$["modules"].downloads&url=https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugin-stats.json)][community plugin]

[Buy Me a Coffee]: https://buymeacoffee.com/polyipseity
[Buy Me a Coffee/embed]: https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=polyipseity&button_colour=40DCA5&font_colour=ffffff&font_family=Lato&outline_colour=000000&coffee_colour=FFDD00
[Obsidian]: https://obsidian.md/
[changelog]: https://github.com/polyipseity/obsidian-modules/blob/main/CHANGELOG.md
[community plugin]: https://obsidian.md/plugins?id=modules
[latest release]: https://github.com/polyipseity/obsidian-modules/releases/latest
[other things]: https://github.com/polyipseity/obsidian-monorepo
[plugin library]: https://github.com/polyipseity/obsidian-plugin-library
[repository]: https://github.com/polyipseity/obsidian-modules
[trailer]: https://raw.githubusercontent.com/polyipseity/obsidian-modules/main/assets/trailer.png

Load JavaScript and related languages like TypeScript modules from the vault and the Internet.

[![Buy Me a Coffee/embed]][Buy Me a Coffee]

__[Repository] · [Changelog] · [Community plugin] · [Other things] · [Features](#features) · [Installation](#installation) · [Usage](#usage) · [Contributing](#contributing) · [Security](#security)__

![Trailer]

For first time users, read the [installation](#installation) section first!

This file is automatically opened on first install. You can reopen it in settings or command palette.

## Features

- Load JavaScript and TypeScript modules from the vault and the Internet on all platforms.
- No configuration needed.
- Resolves relative paths, vault paths, Markdown links, wikilinks, and external links.
- Loads Markdown files as code.
- Supports using other modules inside modules.
- Loads CommonJS (`module.exports`) and ES modules (`export`).
- Supports circular dependencies for CommonJS modules.
- Configurable require name.
- Adds source maps for debugging.
- Supports popular plugins like Dataview and Templater.

## Installation

1. Install plugin.
	- Community plugins
		1. Install the [plugin][community plugin] from community plugins directly.
	- Manual
		1. Create directory `modules` under `.obsidian/plugins` of your vault.
		2. Place `manifest.json`, `main.js`, and `styles.css` from the [latest release] into the directory.
	- Building (latest)
		1. Clone this repository, including its submodules.
		2. Install [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm).
		3. Run `npm install` in the root directory.
		4. Run `npm run obsidian:install <vault directory>` in the root directory.
	- [Obsidian42 - BRAT](https://obsidian.md/plugins?id=obsidian42-brat) (latest)
		- See [their readme](https://github.com/TfTHacker/obsidian42-brat#readme).
2. Enable plugin.
3. (optional) Configure plugin settings.

## Usage

- Enable the plugin.
- To import a module:
```JavaScript
// Using `require.import` is recommended.
await self.require.import("obsidian") // builtin modules such as the Obsidian API
await self.require.import("vault/path/to/a module.md") // vault path
// The following three require context and may not be able to infer the current directory. Please file an issue if so.
await self.require.import("../relative/path/to/a module.js") // relative path
await self.require.import("[omitted or whatever](markdown/link/to/a%20module.js.md)") // Markdown link
await self.require.import("[[wikilink/to/a module|ommited or whatever]]") // wikilink
// The following one requires enabling external links in settings.
await self.require.import("https://esm.sh/scratchblocks") // external link
// You can workaround the inability to infer the current directory.
await self.require.import("../relative/path/to/a module.js", { cwd: context.currentDirectory })

// If `await` is not supported, use `require` instead. It has less support for loading modules, however.
self.require("obsidian")
self.require("vault/path/to/a module.md")
// The following three require context and may not be able to infer the current directory. Please file an issue if so.
self.require("../relative/path/to/a module.js")
// The following three may not work in startup scripts.
self.require("[ommited or whatever](markdown/link/to/a%20module.js.md)")
self.require("[[wikilink/to/a module|omitted or whatever]]")
// The following one requires enabling external links and adding the link to preloaded external links in settings.
self.require("https://esm.sh/scratchblocks") // external link
// You can workaround the inability to infer the current directory.
self.require("../relative/path/to/a module.js", { cwd: context.currentDirectory })
```
- To use entities in a module:
```JavaScript
const { eat, pi } = await self.require.import("[[module]]")
eat(2 * pi)
// OR
const mod = await self.require.import("[[module]]")
mod.eat(2 * mod.pi)
```
- To create a module, create a JavaScript or related language file or a Markdown file with JavaScript or related language code blocks.
	- For `require` (but not `require.import`), the module file needs to be preloaded, which can be configured in settings. By default, preloaded files have the following extensions: `.js`, `.js.md`, `.mjs`, `.mjs.md`, `.ts.md`, `.mts.md`, `.ts`, `.ts.md`
	- Modules should not have global or side effects because they are cached and thus not reloaded on every requiring.
	- For Markdown files, code block languages that are loaded can be configured in settings.
	- For non-JavaScript languages, ensure the module file has the correct file extension (also applies to `.xxx.md`) or prepend the following metadata:
```TypeScript
// { "language": "TypeScript" }

export const variable: string = "string"
```
````Markdown
---
module:
  language: TypeScript
---

```TypeScript
export const variable: string = "string"
```
````
- Module exports can be CommonJS-style or ES module-style:
```JavaScript
// ES module-style, supported by `require.import`.
export function fun() {}
export const variable = "string"
export default 42 // The default export has the name `default`.

// CommonJS-style, supported by both `require` and `require.import`.
module.exports.fun = function() {}
module.exports.variable = "string"
module.exports.default = 42
exports.abbreviatedForm = {}
```
- The full API is available from [`sources/@types/obsidian-modules.ts`](sources/%40types/obsidian-modules.ts).

## Contributing

Contributions are welcome!

### Todos

The todos here, ordered alphabetically, are things planned for the plugin. There are no guarantees that they will be completed. However, we are likely to accept contributions for them.

- Add startup modules.
- Add context detection for `dv.view`.
- User-defined module aliases.
- Add bare module transformation support for more CDNs such as <https://cdn.jsdelivr.net>.
- Faster import analysis and transformation.
- Autocomplete with JSDoc.

### Translating

Translation files are under [`assets/locales/`](assets/locales/). Each locale has its own directory named with its corresponding __[IETF language tag](https://wikipedia.org/wiki/IETF_language_tag)__. Some translation keys are missing here and instead located at [`obsidian-plugin-library`][plugin library].

To contribute translation for an existing locale, modify the files in the corresponding directory.

For a new locale, create a new directory named with its language tag and copy [`assets/locales/en/translation.json`](assets/locales/en/translation.json) into it. Then, add an entry to [`assets/locales/en/language.json`](assets/locales/en/language.json) in this format:
```JSONc
{
	// ...
	"en": "English",
	"(your-language-tag)": "(Native name of your language)",
	"uwu": "Uwuish",
	// ...
}
```
Sort the list of languages by the alphabetical order of their language tags. Then modify the files in the new directory. There will be errors in [`assets/locales.ts`](assets/locales.ts), which you can ignore and we will fix them for you. You are welcome to fix them yourself if you know TypeScript.

When translating, keep in mind the following things:
- Do not translate anything between `{{` and `}}` (`{{example}}`). They are __interpolations__ and will be replaced by localized strings at runtime.
- Do not translate anything between `$t(` and `)` (`$t(example)`). They refer to other localized strings. To find the localized string being referred to, follow the path of the key, which is separated by dots (`.`). For example, the key [`youtu.be./dQw4w9WgXcQ`](https://youtu.be./dQw4w9WgXcQ) refers to:
```JSONc
{
	// ...
	"youtu": {
		// ...
		"be": {
			// ...
			"/dQw4w9WgXcQ": "I am 'youtu.be./dQw4w9WgXcQ'!",
			// ...
		},
		// ...
	},
	// ...
}
```
- The keys under `generic` are vocabularies. They can be referred in translation strings by `$t(generic.key)`. Refer to them as much as possible to standardize translations for vocabularies that appear in different places.
- It is okay to move interpolations and references to other localized strings around to make the translation natural. It is also okay to not use some references used in the original translation. However, it is NOT okay to not use all interpolations.

## Security

We hope that there will never be any security vulnerabilities, but unfortunately it does happen. Please [report](#reporting-a-vulnerability) them!

### Supported versions

| Version | Supported |
|-|-|
| latest | ✅ |
| outdated | ❌ |

### Reporting a vulnerability

Please report a vulerability by opening an new issue. We will get back to you as soon as possible.
