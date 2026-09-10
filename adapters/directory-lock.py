"""Hold an OS file lock until the owning coordinator's stdin closes."""
import json, os, sys
if os.name != 'nt':
    print(json.dumps({'error':'DIRECTORY_LOCK_PLATFORM_UNSUPPORTED'}),flush=True);sys.exit(1)
import msvcrt
handle=None
try:
    handle=open(sys.argv[1],'a+b')
    if os.fstat(handle.fileno()).st_size == 0:
        handle.write(b'\0');handle.flush()
    handle.seek(0)
    msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1)
except OSError:
    print(json.dumps({'error':'DIRECTORY_IN_USE'}),flush=True);sys.exit(2)
print(json.dumps({'acquired':True}),flush=True)
try: sys.stdin.buffer.read()
finally:
    handle.seek(0);msvcrt.locking(handle.fileno(),msvcrt.LK_UNLCK,1);handle.close()
