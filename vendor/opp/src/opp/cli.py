"""OPP CLI（命令行接口）。"""
from __future__ import annotations
import argparse, json
from pathlib import Path
from .handshake import negotiate_handshake
from .validation import validate_envelope

def load(path: str) -> dict: return json.loads(Path(path).read_text(encoding="utf-8"))
def _csv(value:str|None): return [x.strip() for x in (value or '').split(',') if x.strip()]

def _bridge_cmd(args) -> int:
    from .bridge import scan_repository, compile_bridge
    if args.bridge_command=="scan":
        result=scan_repository(args.source,source_id=args.source_id,profile=args.profile,max_files=args.max_files,max_total_bytes=args.max_bytes).to_dict()
        text=json.dumps(result,ensure_ascii=False,indent=2)
        if args.out: Path(args.out).write_text(text+"\n",encoding='utf-8')
        print(text); return 0
    result=compile_bridge(args.source,output_dir=args.out,source_id=args.source_id,profile=args.profile,max_findings=args.max_findings,max_semantic_interfaces=args.max_semantic_interfaces)
    print(json.dumps({"status":"PASS" if result['manifest']['validation']['valid'] else "FAIL","状态":"通过" if result['manifest']['validation']['valid'] else "失败","output":str(args.out),"profile":result['manifest']['profile'],"findings":result['manifest']['findingCount'],"semanticInterfaces":result['manifest']['artifacts']['semanticInterfaceCount'],"semanticCapabilities":result['manifest']['artifacts']['semanticCapabilityCount'],"canonicalPromotionPerformed":False,"boundary":result['manifest']['boundary']},ensure_ascii=False,indent=2))
    return 0 if result['manifest']['validation']['valid'] else 2

def _semantic_cmd(args) -> int:
    from .bridge import verify_repository_semantics, compare_ports, synthesize_bridge, apply_transform, plan_repository_connection
    from .bridge.semantic_model import port_from_dict
    if args.semantic_command=='verify':
        result=verify_repository_semantics(args.source,source_id=args.source_id,profile=args.profile).to_dict()
        text=json.dumps(result,ensure_ascii=False,indent=2)
        if args.out: Path(args.out).write_text(text+'\n',encoding='utf-8')
        print(text); return 0
    if args.semantic_command=='compatible':
        producer=port_from_dict(load(args.producer)); consumer=port_from_dict(load(args.consumer))
        result=compare_ports(producer,consumer,producer_authority=_csv(args.producer_authority),consumer_authority=_csv(args.consumer_authority)).to_dict()
        print(json.dumps(result,ensure_ascii=False,indent=2)); return 0 if result['classification'] not in {'incompatible'} else 2
    if args.semantic_command=='synthesize':
        producer=port_from_dict(load(args.producer)); consumer=port_from_dict(load(args.consumer))
        result=synthesize_bridge(producer,consumer,producer_authority=_csv(args.producer_authority),consumer_authority=_csv(args.consumer_authority),allow_lossy=args.allow_lossy)
        text=json.dumps(result,ensure_ascii=False,indent=2)
        if args.out: Path(args.out).write_text(text+'\n',encoding='utf-8')
        print(text); return 0 if result['status']=='candidate' else 2
    if args.semantic_command=='connect':
        producer=verify_repository_semantics(args.producer_source,source_id=args.producer_id,profile=args.producer_profile)
        consumer=verify_repository_semantics(args.consumer_source,source_id=args.consumer_id,profile=args.consumer_profile)
        result=plan_repository_connection(producer,consumer,allow_lossy=args.allow_lossy,max_plans=args.max_plans,max_pairs=args.max_pairs,include_rejected=args.include_rejected)
        text=json.dumps(result,ensure_ascii=False,indent=2)
        if args.out: Path(args.out).write_text(text+'\n',encoding='utf-8')
        print(text); return 0 if result['acceptedPlanCount']>0 else 3
    plan=load(args.plan); value=load(args.value); result=apply_transform(value,plan.get('operations') or [])
    print(json.dumps(result,ensure_ascii=False,indent=2)); return 0

def _runtime_cmd(args) -> int:
    from .runtime import run_invocation, run_interop, InvocationError, InteropError
    try:
        if args.command == "invoke":
            result=run_invocation(load(args.spec),load(args.input),allow_execution=args.allow_execution)
        else:
            result=run_interop(load(args.spec),load(args.input),allow_execution=args.allow_execution)
    except (InvocationError,InteropError) as exc:
        print(json.dumps({"status":"FAIL","状态":"失败","error":str(exc),"boundary":"执行必须显式授权；扫描本身不会执行源码 / execution requires explicit consent; scanning never executes source"},ensure_ascii=False,indent=2))
        return 4
    text=json.dumps(result,ensure_ascii=False,indent=2)
    if args.out: Path(args.out).write_text(text+'\n',encoding='utf-8')
    print(text)
    status=(result.get('receipt') or {}).get('status')
    return 0 if status=='PASS' else 5

def main(argv=None) -> int:
    parser=argparse.ArgumentParser(description="TaoWind OPP 验证、文明握手、桥编译与语义互操作工具 / validator, handshake, bridge compiler and semantic interoperability toolkit")
    sub=parser.add_subparsers(dest="command",required=True)
    p_validate=sub.add_parser("validate",help="验证现实信封 / validate envelope"); p_validate.add_argument("file")
    p_handshake=sub.add_parser("handshake",help="协商两个 CHP offer / negotiate two CHP offers"); p_handshake.add_argument("local"); p_handshake.add_argument("remote")
    p_bridge=sub.add_parser("bridge",help="扫描或编译外部协议资产 / scan or compile external protocol assets")
    bsub=p_bridge.add_subparsers(dest="bridge_command",required=True)
    p_scan=bsub.add_parser("scan",help="静态扫描，不执行源码 / static scan, never execute source")
    p_scan.add_argument("source"); p_scan.add_argument("--profile",default="auto",choices=["auto","generic","rcl","rncs","dwac"]); p_scan.add_argument("--source-id"); p_scan.add_argument("--max-files",type=int,default=5000); p_scan.add_argument("--max-bytes",type=int,default=50_000_000); p_scan.add_argument("--out")
    p_compile=bsub.add_parser("compile",help="生成 OPP 桥接包 / emit OPP bridge bundle")
    p_compile.add_argument("source"); p_compile.add_argument("--out",required=True); p_compile.add_argument("--profile",default="auto",choices=["auto","generic","rcl","rncs","dwac"]); p_compile.add_argument("--source-id"); p_compile.add_argument("--max-findings",type=int,default=5000); p_compile.add_argument("--max-semantic-interfaces",type=int,default=5000)
    p_sem=sub.add_parser("semantic",help="语义验证、兼容判断与自动桥合成 / semantic verification, compatibility and bridge synthesis")
    ssub=p_sem.add_subparsers(dest="semantic_command",required=True)
    p_sv=ssub.add_parser("verify",help="静态推断接口语义 / statically infer interface semantics"); p_sv.add_argument("source"); p_sv.add_argument("--profile",default="auto",choices=["auto","generic","rcl","rncs","dwac"]); p_sv.add_argument("--source-id"); p_sv.add_argument("--out")
    for name,help_text in (("compatible","判断两个端口是否兼容 / compare two ports"),("synthesize","生成声明式转换桥 / synthesize declarative bridge")):
        p=ssub.add_parser(name,help=help_text); p.add_argument("producer"); p.add_argument("consumer"); p.add_argument("--producer-authority",default=""); p.add_argument("--consumer-authority",default="")
        if name=='synthesize': p.add_argument("--allow-lossy",action='store_true'); p.add_argument("--out")
    p_connect=ssub.add_parser("connect",help="自动搜索两个项目之间的桥 / automatically search bridges between two projects")
    p_connect.add_argument("producer_source"); p_connect.add_argument("consumer_source"); p_connect.add_argument("--producer-profile",default="auto",choices=["auto","generic","rcl","rncs","dwac"]); p_connect.add_argument("--consumer-profile",default="auto",choices=["auto","generic","rcl","rncs","dwac"]); p_connect.add_argument("--producer-id"); p_connect.add_argument("--consumer-id"); p_connect.add_argument("--allow-lossy",action='store_true'); p_connect.add_argument("--include-rejected",action='store_true'); p_connect.add_argument("--max-plans",type=int,default=100); p_connect.add_argument("--max-pairs",type=int,default=100000); p_connect.add_argument("--out")
    p_apply=ssub.add_parser("apply",help="执行 OPP 声明式桥计划 / apply OPP declarative bridge plan"); p_apply.add_argument("plan"); p_apply.add_argument("value")
    p_invoke=sub.add_parser("invoke",help="显式执行一个原生调用规范 / explicitly execute one native invocation spec")
    isub=p_invoke.add_subparsers(dest="invoke_command",required=True)
    p_irun=isub.add_parser("run",help="在有界子进程中运行 / run in bounded child process"); p_irun.add_argument("spec"); p_irun.add_argument("input"); p_irun.add_argument("--allow-execution",action="store_true"); p_irun.add_argument("--out")
    p_interop=sub.add_parser("interop",help="执行 Producer → Bridge → Consumer 互操作 / execute producer-to-bridge-to-consumer interoperability")
    rsub=p_interop.add_subparsers(dest="interop_command",required=True)
    p_run=rsub.add_parser("run",help="执行一个互操作运行规范 / execute one interoperability run spec"); p_run.add_argument("spec"); p_run.add_argument("input"); p_run.add_argument("--allow-execution",action="store_true"); p_run.add_argument("--out")
    args=parser.parse_args(argv)
    if args.command=="bridge": return _bridge_cmd(args)
    if args.command=="semantic": return _semantic_cmd(args)
    if args.command in {"invoke","interop"}: return _runtime_cmd(args)
    if args.command=="validate":
        issues=validate_envelope(load(args.file))
        if issues:
            print(json.dumps({"status":"FAIL","状态":"失败","issues":[i.__dict__ for i in issues]},ensure_ascii=False,indent=2)); return 1
        print(json.dumps({"status":"PASS","状态":"通过","boundary":"结构通过不等于现实主张为真 / structural validation is not truth validation"},ensure_ascii=False,indent=2)); return 0
    result=negotiate_handshake(load(args.local),load(args.remote)); print(json.dumps(result,ensure_ascii=False,indent=2)); return 0

if __name__=='__main__': raise SystemExit(main())
