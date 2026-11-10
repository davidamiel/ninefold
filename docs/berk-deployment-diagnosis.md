# Berk parser deployment diagnosis — November 10, 2026

The parser correction passed its build checks but was not observed live after two Pages deployment timeouts. This diagnosis does not identify a proven root cause.

## Evidence

- Successful deployment: [run 42749401641](https://github.com/davidamiel/ninefold/actions/runs/42749401641), commit `bfd9e6ab0acbe5601b8376d3701e47dfe66f39d8`. The deploy action progressed from queued to in-progress to success at 03:28:11 UTC. Its uploaded Pages ZIP was 238,923,740 bytes.
- Failed parser deployment: [run 42751020918](https://github.com/davidamiel/ninefold/actions/runs/42751020918), commit `ddcb43f0d6e5712e0befcdb6961e8c94eb3c41b2`. Build, 298 tests, audits and Chromium checks passed. The artifact uploaded completely: 238,921,287 bytes, artifact ID `13733561665`, ZIP SHA256 `f42cc6c173907e40a9fb0e30fc8360f5ae86665a79fec531f6e45771bc30d38e`.
- First deploy job `129615077130` reported `syncing_files` from 03:43:18; the status became blank at 03:53:15 and the action timed out.
- The single retry, job `129618852018`, initially returned blank statuses, reached `finished_file_sync` at 03:56:52, then remained there until the 04:04:26 timeout. The action canceled deployment at 04:04:27. Both attempts used the same artifact and deployment/build ID.
- The [post-timeout live check](https://github.com/davidamiel/ninefold/actions/runs/42752847569) still returned `[null, null]` for the newly corrected Shady Grove and Sibbach mappings; earlier document corrections and structural reader checks passed.
- The GitHub [status summary](https://www.githubstatus.com/api/v2/summary.json) reported Pages operational, no active incidents, with a page update at 01:54:29 UTC. The preceding November 9 Pages incident was resolved at 18:59 UTC. This does not prove that every Pages deployment was healthy.

## Interpretation and bounded next action

The observable failure occurs after successful authorization, artifact upload and deployment creation; the retry completed file synchronization but never reported successful finalization. The nearly identical artifact sizes do not indicate a size regression. These facts support a Pages backend finalization/state problem as a hypothesis, not a confirmed global outage or a proven content defect.

Increasing the timeout is not a remedy. [deploy-pages v4](https://github.com/actions/deploy-pages/blob/v4/src/internal/deployment.js) caps it at 600,000 milliseconds. GitHub's [documented limits](https://github.com/github/docs/blob/main/content/pages/getting-started-with-github-pages/github-pages-limits.md) also specify a ten-minute deployment timeout and a 1 GB published-site limit. An [upstream report](https://github.com/actions/deploy-pages/issues/406) describes similar intermittent/stale-state symptoms, but supplies no verified fix for this repository.

Prepare one fresh validated build/artifact on the next substantive correction commit, instead of retrying the canceled artifact again. The added `scripts/check_pages_artifact.mjs` checks required files, regular-file shape, link/readability issues and total size; it records file count, largest files, commit and SHA256 fingerprints before upload. Its separate evidence artifact must be inspected in that new run. Keep normal permissions, environment protection, concurrency and the ten-minute timeout. Do not reset Pages configuration or bypass the standard deploy action.

After deployment, run the production browser check and compare the deployed parser fingerprint/mappings. If the fresh attempt again stalls, preserve its exact status timeline and artifacts for a GitHub Pages support investigation. Do not infer publication from a successful build, upload, or `finished_file_sync` status.

This branch adds diagnostic code and workflow steps only. It does not trigger a publication, and the new preflight script has only been syntax-checked in the connector environment; execution evidence will come from the integrated build.

## Integrated build validation

The manual-only workflow now runs the existing Berk Chromium harness against a temporary local server serving `out/`, using the runner's installed Chrome (`BERK_CHROME_CHANNEL=chrome`). It uploads the built-reader evidence independently of deployment. The preflight fingerprints `index.html`, `app.js` and `reader-authorities.js`, and includes the immutable `GITHUB_SHA`. After successful validation it also writes the same manifest into `out/deployment-manifest.json` for publication. Its size/file count describes the validated tree before this manifest is emitted.

For live verification, fetch `deployment-manifest.json` with cache bypass, require its commit to equal the deployed workflow head SHA, then fetch and SHA256-hash the three named live files and compare each with the manifest. A manifest alone is insufficient if the live files differ. Run the existing production browser assertions as the behavior check as well. The main branch's coordinated integration owns the temporary scoped publication trigger and restoration; this diagnostic branch remains manual-only.
