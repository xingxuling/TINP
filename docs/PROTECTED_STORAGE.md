# Protected state provider

`ProtectedStore(directory, { purpose })` exposes a synchronous `exists` getter, `load()`, `save(value)`, and `file` path. One directory contains one `protected-state.dpapi` snapshot. The caller owns the state schema and must acquire its coordinator directory lease before reading or writing state.

Windows current-user DPAPI is the auxiliary execution provider; protocol identity, session, revocation and authority semantics remain with their existing canonical owners. This provider does not invent key custody semantics or promote anything into RCL Core.

The Python adapter invokes `CryptProtectData` / `CryptUnprotectData` through ctypes. It uses `CRYPTPROTECT_UI_FORBIDDEN`, a null prompt and description, and never uses `CRYPTPROTECT_LOCAL_MACHINE`. The purpose is included in DPAPI optional entropy and in the protected versioned envelope. A SHA-256 digest inside that envelope validates the JSON payload after decryption, complementing the DPAPI integrity check and schema checks. SHA-256 here is a corruption check inside the protected envelope, not a replacement encryption algorithm.

The file format is a magic/version prefix, a 32-byte SHA-256 ciphertext checksum, then the DPAPI blob. The outer checksum detects byte corruption even in DPAPI metadata that Windows may ignore. It is unkeyed and adds no independent authentication against an attacker who recomputes it; confidentiality and protected-content authentication remain DPAPI responsibilities.

Only ciphertext reaches filesystem writes, including temporary files. `save` encrypts the complete JSON envelope, creates an exclusive unique temporary file in the same directory, writes and flushes it, closes it, and atomically renames it over the previous snapshot. Normal failures remove that temporary file. Process termination may leave an encrypted temporary file; recovery reads only the committed filename. Windows directory metadata power-loss durability is not proven by this implementation. Application-level acknowledgement ordering must be handled by the coordinator.

The bridge accepts a JSON request on stdin with `action`, `purpose`, and `dataBase64`; it returns JSON on stdout. Plaintext crosses local process pipes in memory, and the adapter never prints it to a terminal or log. Python immutable strings and JavaScript strings cannot be reliably wiped; process memory, swap, crash dumps and privileged debugging are outside the at-rest file protection claim. Native DPAPI buffers and the Node plaintext buffer are cleared on normal completion.

`NEXT_INTERNET_PYTHON` optionally selects the Python executable. Windows and a functioning Python DPAPI bridge are required. Missing runtime, other platforms, decrypt failure, wrong purpose, malformed envelopes and corrupted snapshots fail closed. There is no plaintext fallback or silent identity reset. DPAPI normally binds decryption to the original Windows logon credentials and computer, with documented roaming-profile exceptions; this is not an export, backup, or cross-machine migration mechanism. A process already running as the same Windows user can call this provider. Restoring an older valid ciphertext snapshot is not prevented by DPAPI; anti-rollback requires a separate trusted monotonic authority.

Microsoft references verified on 2026-09-10:

- [CryptProtectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata): current-user defaults, entropy, flags, and LocalFree lifecycle.
- [CryptUnprotectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptunprotectdata): entropy matching, error handling, integrity caveats, and clearing buffers.

`node --test tests/protected-store.test.mjs` exercises actual Windows DPAPI key roundtrip, purpose separation, corruption, snapshot replacement, provider failure, invalid input retention and fresh-process recovery. Other-platform behavior is rejection; Windows tests are skipped there rather than counted as hardware verification.
