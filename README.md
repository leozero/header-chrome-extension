# Header Injector

Chrome extension (Manifest V3) that **adds, overrides or removes HTTP headers** — `Authorization`, API keys, cookies, any custom header — on every request whose **hostname matches a regex**.

- One rule = one hostname regex + a list of headers
- Request **and** response headers, operations `set` / `append` / `remove`
- Applies to everything: pages, `fetch`/XHR, images, scripts, iframes, websockets…
- **Basic auth helper**: type a username / password, get `Authorization: Basic …` (UTF-8 safe)
- Live regex validation and a URL tester right in the settings page
- Popup: global on/off switch, per-rule toggles, rules matching the current site, "rule for this site" shortcut
- Import / export as JSON
- No dependencies, no build step, nothing leaves your browser

Built on [`declarativeNetRequest`](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest): Chrome itself rewrites the headers, so there is no request interception overhead.

## Install

1. Download `header-injector-vX.Y.Z.zip` from the [latest release](../../releases/latest) and unzip it.
2. Open `chrome://extensions`, enable **Developer mode** (top right).
3. Click **Load unpacked** and select the unzipped folder.

To update, unzip the new release over the same folder and click the reload icon on the extension card (your rules are kept).

From source: clone the repo and **Load unpacked** the `extension/` folder.

## Usage

Click the toolbar icon → **Settings** (or **+ Rule for this site**), then:

| Field | Example |
| --- | --- |
| Hostname regex | `^api\.staging\.example\.com$` |
| Header | `Request` · `Set` · `Authorization` · `Bearer eyJhbGciOi…` |

For HTTP Basic auth, click **+ Basic auth** on a rule (or the key icon on an `Authorization` row) and enter the username and password: the value `Basic base64(username:password)` is generated for you, and the icon reopens the dialog pre-filled to change it. Base64 is an encoding, not encryption.

The badge shows the number of active rules (`!` if one has an error, `OFF` when paused).

### Hostname regex

The regex is tested against the **hostname only** (no scheme, port, path or query), case-insensitively.

| Pattern | Matches |
| --- | --- |
| `^api\.example\.com$` | exactly `api.example.com` |
| `(^\|\.)example\.com$` | `example.com` and all its subdomains |
| `^(dev\|staging)\.example\.com$` | `dev.example.com`, `staging.example.com` |
| `^localhost$\|^127\.0\.0\.1$` | local dev servers (any port) |
| `example` | any hostname *containing* `example` — anchor your patterns! |

Regexes use Chrome's [RE2 syntax](https://github.com/google/re2/wiki/Syntax). For safety, wildcards (`.`, `[^…]`, `\S`, `\W`, `\D`) are confined to hostname characters, so `.*\.example\.com$` can never match `https://evil.com/x.example.com` and leak your token. Hover the regex field to see the generated URL filter.

### Operations

| Operation | Effect |
| --- | --- |
| `Set` | Adds the header, replacing any existing value |
| `Append` | Appends to the existing value (Chrome restricts this to a [list of headers](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest#type-HeaderOperation) for requests) |
| `Remove` | Removes the header |

When several rules touch the same header, the rule **higher in the list wins**.

### Notes

- Header values (tokens…) are stored unencrypted in `chrome.storage.local`, and included in JSON exports — handle export files accordingly.
- Some headers are controlled by the browser and cannot be changed by extensions.
- The `<all_urls>` host permission is required to modify headers; rules only apply to hosts matching your regexes.

## Development

```bash
npm test          # unit tests (node:test, no dependencies)
npm run check     # manifest / version sanity checks
npm run package   # dist/header-injector-vX.Y.Z.zip
npm run icons     # regenerate icons
```

Layout:

```
extension/
  manifest.json
  background.js        # syncs config -> declarativeNetRequest dynamic rules, badge
  lib/pattern.js       # hostname regex -> confined URL regex (RE2)
  lib/rules.js         # config -> DNR rules
  lib/config.js        # data model, storage
  lib/basic-auth.js    # Basic auth encode / decode
  options/  popup/  ui/  icons/
test/                  # unit tests
scripts/               # packaging, versioning, icons
```

## Releasing

Releases are built by GitHub Actions ([`release.yml`](.github/workflows/release.yml)): tests, version check, zip, and a GitHub release with auto-generated notes.

**From your machine**

```bash
npm version patch   # or minor / major
```

This bumps `package.json` **and** `extension/manifest.json`, commits, tags `vX.Y.Z` and pushes; the tag triggers the release.

**From GitHub**: *Actions → Release → Run workflow*, pick `patch` / `minor` / `major`.

[`ci.yml`](.github/workflows/ci.yml) runs tests and builds the zip (as a downloadable artifact) on every push to `main` and every pull request.

## License

[MIT](LICENSE)
