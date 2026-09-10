"""Build an internal source archive with deterministic file order and content hashes."""
from pathlib import Path
import hashlib,json,zipfile,sys,subprocess

root=Path(__file__).resolve().parents[1]
destination=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root.parent.parent/'deliverables'
destination.mkdir(parents=True,exist_ok=True)
name='TaoWind-Next-Internet_v0.1.0-alpha.1'
excluded={'.git','.runs','__pycache__','.venv','node_modules'}
files=sorted(p for p in root.rglob('*') if p.is_file() and not any(x in excluded for x in p.relative_to(root).parts) and p.suffix!='.pyc' and p.name!='SOURCE_MANIFEST.json')
manifest={'format':'twni.internal-source-package.v0.1','version':'0.1.0-alpha.1','public_release':False,
 'files':[{'path':p.relative_to(root).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
result=subprocess.run(['git','rev-parse','HEAD'],cwd=root,capture_output=True,text=True)
manifest['localCommit']=result.stdout.strip() if result.returncode==0 else None
archive=destination/(name+'.zip')
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in files:z.write(p,name+'/'+p.relative_to(root).as_posix())
 z.writestr(name+'/SOURCE_MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2).encode('utf-8'))
with zipfile.ZipFile(archive) as z:
 if z.testzip() is not None:raise RuntimeError('Corrupt archive')
 for item in manifest['files']:
  if hashlib.sha256(z.read(name+'/'+item['path'])).hexdigest()!=item['sha256']:raise RuntimeError('Archive digest mismatch: '+item['path'])
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
(destination/(name+'.sha256')).write_text(digest+'  '+archive.name+'\n',encoding='ascii')
print(json.dumps({'archive':str(archive),'sha256':digest,'files':len(files),'bytes':archive.stat().st_size},ensure_ascii=True))
