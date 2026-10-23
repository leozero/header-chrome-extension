# Chrome Web Store listing

Everything to copy-paste into the [Developer Dashboard](https://chrome.google.com/webstore/devconsole). Images are in [`store/images/`](images/) (regenerate them with `npm run store-assets`).

## Store listing tab

**Name** (from the manifest): Header Injector

**Summary** (from the manifest `description`, max 132 chars):

> Add, override or remove HTTP headers (Authorization, custom...) on hosts matching a regex.

**Category:** Developer Tools  
**Language:** English

**Description:**

```text
Header Injector adds, overrides or removes HTTP headers on every request sent to the hosts you choose — perfect for hitting a staging API with a token, testing Basic auth, faking CORS headers, or stripping a header while debugging.

HOW IT WORKS
Each rule is a hostname regular expression plus a list of headers:
• ^api\.staging\.example\.com$ → Authorization: Bearer …
• (^|\.)preview\.example\.com$ → Authorization: Basic … (built-in username/password helper)
• ^localhost$ → response header Access-Control-Allow-Origin: *

FEATURES
• Request and response headers, with Set / Append / Remove operations
• Applies to everything: pages, fetch/XHR, scripts, images, iframes, websockets…
• Hostname regex with live validation and a built-in URL tester
• Safe matching: wildcards can never match outside the hostname, so a token is never sent to another site by accident
• Basic auth helper: type a username and password, get the Authorization header
• Sensitive values (tokens, keys, cookies) are masked in the UI
• Popup: global on/off switch, per-rule toggles, rules matching the current site, one-click "rule for this site"
• Rule ordering: the rule highest in the list wins when two rules set the same header
• Import / export as JSON
• Badge with the number of active rules, or "!" when a rule has an error

PRIVACY
Your rules stay in your browser (chrome.storage.local). No analytics, no tracking, no remote code, no network requests of its own. Headers are only sent to the hosts matching your rules.

Built on Chrome's declarativeNetRequest API: Chrome itself rewrites the headers, with no request interception overhead.

Open source (MIT): https://github.com/leozero/header-chrome-extension
```

**Graphic assets:**

| Asset | File |
| --- | --- |
| Store icon (128×128) | `images/store-icon-128.png` |
| Screenshots (1280×800) | `images/screenshot-1-rules.png` … `images/screenshot-4-dark.png` |
| Small promo tile (440×280) | `images/promo-small-440x280.png` |
| Marquee promo tile (1400×560, optional) | `images/promo-marquee-1400x560.png` |

**Additional fields:**

- Homepage URL: `https://github.com/leozero/header-chrome-extension`
- Support URL: `https://github.com/leozero/header-chrome-extension/issues`

## Privacy tab

**Single purpose description:**

```text
Add, override or remove HTTP request and response headers on requests sent to hosts that the user selects with a hostname regular expression.
```

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `declarativeNetRequest` | Used to create the header modification rules (modifyHeaders) that Chrome applies to requests sent to the hosts configured by the user. This is the extension's single purpose. |
| `storage` | Saves the user's rules (hostname patterns and headers) locally with chrome.storage.local. |
| Host permission (`<all_urls>`) | Chrome requires host access to modify request and response headers. The target hosts are defined by the user as regular expressions, which can match any host (including localhost and private networks) and cannot be known in advance or expressed as match patterns. Headers are only modified on requests matching the user's own rules. No content script is injected and no page content is read. |

**Remote code:** No, I am not using remote code. (All code is packaged in the extension.)

**Data usage** — what user data do you collect (i.e. transmit off the device)? **None.** Leave every data type unchecked: the configuration, including header values such as tokens, stays in `chrome.storage.local` and is only sent as HTTP headers to the hosts chosen by the user, which is the user-initiated purpose of the extension.

Check the three certifications:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** `https://github.com/leozero/header-chrome-extension/blob/main/PRIVACY.md`

## Distribution tab

- Visibility: Public (or Unlisted to share by link only)
- Regions: All regions
