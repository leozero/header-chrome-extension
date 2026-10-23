# Privacy Policy — Header Injector

_Last updated: October 23, 2026_

Header Injector is a browser extension that adds, overrides or removes HTTP headers on requests to hosts that **you** configure.

## Data the extension handles

The only data the extension handles is the configuration you enter yourself:

- rule names and hostname patterns (regular expressions);
- header names and values, which may include credentials such as `Authorization` tokens, API keys, cookies or Basic auth usernames and passwords.

To show which rules match the current site, the popup reads the URL of the active tab when you open it. This URL is used on the spot and is never stored.

## Where it is stored

Your configuration is stored **locally in your browser**, using `chrome.storage.local`. It is not synced to your Google account and is removed when you uninstall the extension.

Header values are stored as you typed them (Basic auth credentials are Base64-encoded, which is not encryption). Anyone with access to your browser profile can read them, as with any other data stored by your browser.

## What is sent, and to whom

- The extension sends the headers you configured **only** to the hosts matching your rules, as part of the requests your browser already makes. This is the extension's single purpose.
- The extension does **not** collect, transmit, sell or share any data with the developer or any third party. It contains no analytics, tracking, advertising or remote code, and makes no network requests of its own.

## Exports

The **Export** button creates a JSON file containing your rules, including header values. This file is saved where you choose; handle it like any file containing credentials.

## Changes

Changes to this policy will be published in this repository: <https://github.com/leozero/header-chrome-extension/blob/main/PRIVACY.md>.

## Contact

Questions or concerns: open an issue at <https://github.com/leozero/header-chrome-extension/issues>.
