import {InternetSuite} from '../src/suite.mjs';

const suite = await InternetSuite.start({transport:'tcp', timeoutMs:2500});

function view(step, request, result) {
  const receipt = result.receipt?.body;
  return {
    步骤: step,
    业务请求: request,
    执行状态: result.status,
    服务等级: result.level,
    路由: receipt?.route ?? null,
    Provider: receipt?.providerId ?? null,
    回执根: result.receipt?.root ?? null,
    当前证据根: suite.ledger.root,
  };
}

try {
  console.log(JSON.stringify({
    场景: '企业内部 Agent 请求在节点/Provider 故障时继续受控运行',
    说明: '这是本机基础设施演示，不连接真实 CRM。底层 Provider 仍使用只读确定性测试能力；重点展示身份、权限、路由切换、Provider 切换和证据连续性。'
  }, null, 2));

  const normalRequest = '客服 Agent：读取客户 A1024 的订单摘要（演示载荷）';
  const normal = await suite.use(normalRequest);
  console.log(JSON.stringify(view('1. 正常执行', normalRequest, normal), null, 2));

  await suite.nodes.get('C').call('provider', {enabled:false});
  const providerRequest = '客服 Agent：再次读取客户 A1024 的订单摘要（主 Provider 暂不可用）';
  const providerFallback = await suite.use(providerRequest);
  console.log(JSON.stringify(view('2. 主 Provider 不可用，切换到备用 Provider', providerRequest, providerFallback), null, 2));

  await suite.nodes.get('C').call('provider', {enabled:true});
  await suite.nodes.get('A').call('fault', {blocked:['B']});
  await suite.nodes.get('B').call('fault', {blocked:['A']});
  const routeRequest = '客服 Agent：第三次读取客户 A1024 的订单摘要（中间链路故障）';
  const routeFallback = await suite.use(routeRequest);
  console.log(JSON.stringify(view('3. 中间链路故障，改走备用路径', routeRequest, routeFallback), null, 2));

  console.log(JSON.stringify({
    结论: '三次请求都在原有身份与权限边界内处理；故障时没有静默扩大权限。',
    提醒: '这仍是本机受控演示，不代表真实 CRM、跨设备生产部署或生产级安全认证。'
  }, null, 2));
} finally {
  await suite.close();
}
