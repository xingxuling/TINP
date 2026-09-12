# Progress without physical devices or an Authority Provider

The available substitute is **hosted execution plus cross-platform evidence
handoff**, with production authority still ungranted. It does not require new
accounts, purchased machines or user private keys.

## Completed remote experiment

[GitHub run 34692267549](https://github.com/xingxuling/TINP/actions/runs/34692267549)
completed all three jobs successfully on 2026-09-12:

1. An Ubuntu hosted runner checked out OPP commit
   `231a8a95631227b85ce58a1aaf2ad1b91210c10f`, built/installed its wheel and ran
   Boltons, more-itertools and JMESPath with real failure/recovery cases.
2. A second Ubuntu job downloaded that evidence and verified all file hashes,
   success/recovery receipts and deliberate result tampering in TINP's Node implementation.
3. A Windows hosted job independently repeated the same verification.

Both receivers bound summary SHA-256
`78af15ce2ae4c860f6fdf7aab0e4d1659b386b987b783d8fb15b79ae77f3a888`.
That expected hash was passed through a job output, separately from the artifact;
the verifier hard-fails on mismatch. Actions are pinned to commit SHAs, permissions
are read-only, credentials are not persisted and no deployment occurs.

The producer's success/negative/recovery/check sequence took 0.2125 / 0.2162 /
0.2077 seconds per library, excluding dependency installation, scan and human
integration. These timings do not establish a cross-platform performance comparison.

Raw service run metadata, artifact IDs/digests, producer evidence, two acceptance
receipts and logs are archived under `evidence/external-onboarding-2026-09-12/cloud/`.
The workflow is `.github/workflows/external-onboarding.yml`; rerun it on the
candidate branch. Artifact retention on GitHub is 14 days, so the repository archive
is retained for later review.

## Exact replacement boundary

| Missing resource | Useful available substitute | Still unproven |
| --- | --- | --- |
| A second user-owned device | Separate GitHub Linux/Windows hosted jobs | Independent physical hosts and direct inter-device TINP transport |
| External operator | Package install and black-box file verification on remote runners | A separately governed consumer or independent security auditor |
| Real Authority Provider | Existing test-key lifecycle tests and read-only, authority-free observations | Enrollment, operational revocation, hardware custody, trusted time, production approvals |
| Recovery under failure | Real library exceptions, corrected re-invocation, existing local crash/DPAPI regressions | Authorized cross-host failover and durable external side-effect recovery |

GitHub's run timestamps and HTTPS service metadata are external observations. They
are not promoted to a cryptographic trusted-time service or an authority enrollment
decision. The existing OPP/TINP content roots cannot supply that missing authority.
The next no-device work can use these runners for further compatibility regressions
and a real MCP integration; no new protocol family or local issuer is needed.

Final compatibility repair replay: [34692507409](https://github.com/xingxuling/TINP/actions/runs/34692507409) also passed all three jobs. OPP source `7c4970cd1f19ffcbc3f90ac6ed39ff0ab9364d45`; expected summary SHA-256 `4cfbfe16c83fc2bfe8f3ba68b6f232736a7c1b6a9bbf9058512985f17a91be5c`. Full artifacts retained in `cloud-current/` alongside the earlier run.
