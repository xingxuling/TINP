# External Recovery Anchor Security Court

Verdict: **VERIFIED_LOCAL_CANDIDATE for the bounded observations below**. This is not a production anti-rollback claim, a global registry, or a K400 promotion.

The candidate was tested with an independent signer child process. The coordinator received only the public key and a signed statement. It rejected malformed or forged roots, a replaced signer, a revoked keyring entry, a lower sequence, and an anchor whose ledger prefix was absent. A complete older copy of the durable directory was restored after sequence 2 had been externally signed; startup failed with `RECOVERY_ANCHOR_ROLLBACK`. The newer directory reopened with the same subject and lease roots, and no private witness key appeared in the protected checkpoint.

The anchor is opt-in. Existing unpinned state remains the explicit local-confirmation fixture. Pinning is a local trust bootstrap, not human identity registration. `accept` may use a signed anchor for an already verified ledger prefix when startup has appended maintenance evidence; this is recorded as `adoptionMode=ledger-prefix` and does not renew or expand authority.

The court does not accept the following as proven: independently trusted time, authenticated online revocation, secure hardware key custody, two-device encrypted transport, code/configuration anti-rollback, protection from a malicious witness, or coverage of the unanchored suffix after the last import. A whole-directory copy made after the most recent anchor can still be locally indistinguishable until a newer anchor is issued.

Regression cases are maintained in `tests/recovery-anchor.test.mjs` and the runnable witness is `scripts/recovery-anchor-demo.mjs`. Evidence generation must report the exact test exit code, source hash set, anchor roots, rollback error, and boundary text.
