# Deploy Ninefold on GitHub Pages

The public website is independent of ChatGPT. All public materials are editable in `dist/data/`; the build packages them without altering source text. Private user data belongs only in Firebase, never in this repository.

## GitHub

1. Create an empty public `davidamiel/ninefold` repository (do not initialize a README). The current integration cannot create repositories.
2. Push this checkout to it. In Settings → Pages, select **GitHub Actions** as the source.
3. The Pages workflow installs locked dependencies, runs checks, builds `out/`, and publishes it when you select Actions → Publish Ninefold → Run workflow. Ordinary pushes do not publish the website; other CI checks may still run. Its deployment output is the authoritative website URL. Project-subdirectory hosting works with the existing relative asset paths and hash routes.


## What publishing runs

The manual **Publish Ninefold** workflow installs dependencies, runs the test suite,
builds the website, validates the packaged files, deploys to Pages, and verifies
that the live commit and file fingerprints match the release.

Case-specific Berk browser checks, screenshots, and source/review-ledger audit
reports are not part of publishing. Their scripts remain in the repository for
development use; this cleanup adds no separate workflow. The existing Document
quality workflow is unchanged.

The workflow uses one job: checkout and Node/Python setup happen once, then
checks, build, validation, upload, deployment, and live-version verification run
in order. A failed test, build, or validation stops publication. The same Node
environment performs the live-version check, with no second checkout or runner.
No browser installation or browser automation runs during publication.

## Firebase (Spark plan)

1. At https://console.firebase.google.com/ create a project, for example **Ninefold**. Google Analytics is optional and unnecessary for this setup. Keep the no-cost Spark plan; do not add a billing account.
2. Add a **Web app** named Ninefold. Copy the public Firebase configuration object into `dist/data/firebase-config.json`. Required fields: `apiKey`, `authDomain`, `projectId`, `appId`. These web configuration values are public identifiers, not administrative credentials. Never commit a service-account key or CLI token.
3. Authentication → Sign-in method: enable **Google** (choose a support email) and **Email/Password**. Do not enable anonymous accounts. Authentication → Settings → Authorized domains: add `davidamiel.github.io` and any custom domain you later use. Use HTTPS for deployment; localhost may be added for development.
4. Firestore Database: create a **Standard edition** database, select the intended data region, and start in **production mode**. Deploy this repository's `firestore.rules` before testing accounts. Never use unrestricted test-mode rules.
5. On your laptop, from this checkout: `npm ci`, `npx firebase login`, then `npx firebase deploy --only firestore:rules --project YOUR_PROJECT_ID`. CLI credentials remain outside Git. Alternatively, paste the complete `firestore.rules` contents into the console Rules editor and click Publish.
6. Commit the public web configuration and push. Run the Pages workflow once; that deployment enables accounts automatically. No Firebase admin key or server is required for the browser SDK.

Until Firebase is configured, public reading works and the sign-in dialog states that accounts are being connected. It does not pretend to authenticate users. The Firestore rules are the security boundary; hiding Library alone is not authorization.

## Laptop walkthrough remains open

Follow `docs/walkthrough.md` on desktop and mobile. Also test:

- Browse cases, transcripts, and audio in a signed-out browser; no sign-in prompt during reading.
- Open `#/library` while signed out: show the sign-in gate and no private data.
- Sign in with Google and with email/password; reset a password.
- Save a case and note, then verify them in a second browser/device using the same account.
- Switch to a second account: the first user's library must not appear.
- Go offline, edit a note, reconnect, and verify synchronization; sign out and check Library is gated.
- Verify Firestore denies anonymous and cross-user requests (`npm run test:rules`).

Existing notes on the old hosted domain remain in that browser's local storage. Export them there before moving. This first migration does not silently copy or overwrite those notes; an explicit import can be added after a user reviews an export.
