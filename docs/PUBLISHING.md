# Publishing to the Chrome Web Store

The first submission is manual (the Store only gives an extension ID once the item exists). After that, every release is uploaded and submitted for review automatically by [`release.yml`](../.github/workflows/release.yml).

## 1. Developer account (once)

1. Sign in at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) with the Google account that will own the extension.
2. Accept the developer agreement and pay the one-time registration fee.
3. Complete the account details: contact email (it must be verified before publishing) and identity / trader status as requested.

## 2. First submission (manual)

1. Download the zip of the latest [GitHub release](https://github.com/leozero/header-chrome-extension/releases/latest) (or run `npm run package`).
2. Dashboard → **Add new item** → upload the zip.
3. Fill the tabs with the content of [`store/LISTING.md`](../store/LISTING.md):
   - **Store listing**: description, category, images from [`store/images/`](../store/images/).
   - **Privacy**: single purpose, permission justifications, data usage, privacy policy URL.
   - **Distribution**: visibility and regions.
4. **Submit for review**. Expect a few days: extensions with broad host permissions get an in-depth review.

## 3. Automatic publishing (once)

You need two IDs and one set of credentials.

### IDs

- **Extension ID**: the 32-letter ID shown on the item in the dashboard (also in its Store URL).
- **Publisher ID**: Dashboard → **Account** (publisher settings) → Publisher ID.

### Credentials — option A: service account (recommended)

Service account keys do not expire.

1. In the [Google Cloud Console](https://console.cloud.google.com/), create (or pick) a project and **enable the Chrome Web Store API**.
2. *IAM & Admin → Service accounts* → **Create service account** (no role needed).
3. On the service account → *Keys* → **Add key → JSON**. Keep the file safe and delete it once stored in GitHub.
4. In the Developer Dashboard → **Account**, add the service account email (`…@….iam.gserviceaccount.com`) as the API service account. Only one per publisher.

### Credentials — option B: OAuth client + refresh token

1. In the Cloud Console, enable the **Chrome Web Store API**, configure the OAuth consent screen (External) and **publish it to production**: refresh tokens of apps left in "Testing" expire after 7 days.
2. *Credentials → Create credentials → OAuth client ID*, type **Web application**, authorized redirect URI `https://developers.google.com/oauthplayground`.
3. In the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground): ⚙ → *Use your own OAuth credentials* (client ID / secret), scope `https://www.googleapis.com/auth/chromewebstore`, **Authorize APIs** with the publisher account, then **Exchange authorization code for tokens** and copy the refresh token.

### Configure GitHub

Repository → *Settings → Secrets and variables → Actions*:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `CWS_PUBLISHER_ID` | publisher ID |
| Variable | `CWS_EXTENSION_ID` | extension ID |
| Variable (optional) | `CWS_PUBLISH_TYPE` | `STAGED_PUBLISH` to publish manually after approval (default: publish as soon as approved) |
| Secret (option A) | `CWS_SERVICE_ACCOUNT_KEY` | full content of the JSON key |
| Secrets (option B) | `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` | OAuth client and refresh token |

Or with the GitHub CLI:

```bash
gh variable set CWS_PUBLISHER_ID --body "<publisher id>"
gh variable set CWS_EXTENSION_ID --body "<extension id>"
gh secret set CWS_SERVICE_ACCOUNT_KEY < service-account.json
```

The Store step of the release workflow is skipped until `CWS_EXTENSION_ID` is set.

## 4. Releasing

```bash
npm version patch   # or minor / major
```

The release workflow tests, creates the GitHub release, uploads the zip to the Store and submits it for review. The new version goes live once approved (or waits for you in the dashboard with `STAGED_PUBLISH`).

Notes:

- The Store refuses a package whose version is not higher than the last uploaded one — `npm version` takes care of it.
- Only one submission can be pending review: wait for the previous one (or cancel it in the dashboard) before releasing again.
- Changing permissions or the listing triggers a new, possibly longer, review.
- To publish manually from your machine: `npm run package`, then export the `CWS_*` variables and run `npm run publish-store`.

## Updating the store images

`npm run store-assets` regenerates the screenshots and promo tiles in `store/images/` from the real extension UI (requires Chrome for Testing, e.g. `npx @puppeteer/browsers install chrome@stable` and `CHROME_PATH`). Upload the new images in the dashboard.
