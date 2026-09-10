"""Current-user Windows DPAPI provider. JSON pipes only; never writes secrets to disk."""
import base64
import ctypes
from ctypes import wintypes
import json
import sys

MAX_BYTES = 32 * 1024 * 1024


def transform(action, purpose, data):
    if sys.platform != "win32":
        raise ValueError("unsupported platform")
    if action not in ("protect", "unprotect") or not isinstance(purpose, str) or not purpose or len(purpose) > 1024:
        raise ValueError("invalid request")

    class DATA_BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_ubyte))]

    crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    common = [ctypes.POINTER(DATA_BLOB), ctypes.c_void_p, ctypes.POINTER(DATA_BLOB),
              ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(DATA_BLOB)]
    crypt32.CryptProtectData.argtypes = common
    crypt32.CryptProtectData.restype = wintypes.BOOL
    crypt32.CryptUnprotectData.argtypes = common
    crypt32.CryptUnprotectData.restype = wintypes.BOOL
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    kernel32.LocalFree.restype = ctypes.c_void_p
    incoming = ctypes.create_string_buffer(data)
    entropy_bytes = ("TINP-DPAPI-v1\0" + purpose).encode("utf-8")
    entropy_buffer = ctypes.create_string_buffer(entropy_bytes)
    blob = DATA_BLOB(len(data), ctypes.cast(incoming, ctypes.POINTER(ctypes.c_ubyte)))
    entropy = DATA_BLOB(len(entropy_bytes), ctypes.cast(entropy_buffer, ctypes.POINTER(ctypes.c_ubyte)))
    output = DATA_BLOB()
    operation = crypt32.CryptProtectData if action == "protect" else crypt32.CryptUnprotectData
    try:
        # UI_FORBIDDEN only: never set LOCAL_MACHINE, which broadens the decrypting principal.
        if not operation(ctypes.byref(blob), None, ctypes.byref(entropy), None, None, 1, ctypes.byref(output)):
            raise OSError("DPAPI operation failed")
        if output.cbData > MAX_BYTES:
            raise ValueError("output too large")
        return ctypes.string_at(output.pbData, output.cbData)
    finally:
        ctypes.memset(incoming, 0, len(incoming))
        if output.pbData:
            ctypes.memset(output.pbData, 0, output.cbData)
            kernel32.LocalFree(output.pbData)


def main():
    try:
        raw = sys.stdin.buffer.read(MAX_BYTES * 2 + 1)
        if len(raw) > MAX_BYTES * 2:
            raise ValueError("request too large")
        request = json.loads(raw)
        data = base64.b64decode(request["dataBase64"], validate=True)
        if len(data) > MAX_BYTES:
            raise ValueError("data too large")
        result = transform(request["action"], request["purpose"], data)
        sys.stdout.write(json.dumps({"ok": True, "dataBase64": base64.b64encode(result).decode("ascii")}))
    except Exception:
        # Do not reveal request bodies, decrypted material, exception repr, or tracebacks.
        sys.stdout.write('{"ok":false,"error":"DPAPI_OPERATION_FAILED"}')
        sys.exit(1)


if __name__ == "__main__":
    main()
