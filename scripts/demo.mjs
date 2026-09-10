import {InternetSuite,parseLifeIntent} from '../src/suite.mjs';
const input=process.argv.slice(2).join(' ')||'我要使用字符计数能力完成：你好，新互联网🌏';
const intent=parseLifeIntent(input);const suite=await InternetSuite.start();
try{
  const result=await suite.use(intent.text);
  console.log(JSON.stringify({用户意图:input,结果:result.result,状态:result.level,
    路径:result.receipt?.body.route,证据账本:suite.ledger.file,验证范围:'三个独立本机进程，真实回环传输',nodes:await suite.stats()},null,2));
}finally{await suite.close();}
