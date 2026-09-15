import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyNetworkHost,endpointPolicy,enumerateLocalBearers,selectLocalBearer,LOCAL_FIRST_POLICY} from '../src/bearer-policy.mjs';

test('classifies LAN and public addresses without treating internet as free local transport',()=>{
  assert.equal(classifyNetworkHost('192.168.1.7').scope,'lan');assert.equal(classifyNetworkHost('172.16.4.9').scope,'lan');assert.equal(classifyNetworkHost('10.1.2.3').scope,'lan');assert.equal(classifyNetworkHost('8.8.8.8').scope,'public');assert.equal(endpointPolicy({host:'8.8.8.8'},LOCAL_FIRST_POLICY).code,'PUBLIC_EGRESS_DENIED');assert.equal(endpointPolicy({host:'192.168.1.7'},LOCAL_FIRST_POLICY).allowed,true);
});
test('metered links fail closed by default',()=>{const result=endpointPolicy({host:'192.168.1.8',metered:true},LOCAL_FIRST_POLICY);assert.equal(result.allowed,false);assert.equal(result.code,'METERED_LINK_DENIED');});
test('interface enumeration prefers wifi before ethernet and excludes public addresses',()=>{const interfaces={wlan0:[{address:'192.168.50.2',family:'IPv4',internal:false}],eth0:[{address:'10.0.0.2',family:'IPv4',internal:false}],wan0:[{address:'203.0.113.2',family:'IPv4',internal:false}]};const candidates=enumerateLocalBearers(interfaces);assert.equal(candidates.some(x=>x.address==='203.0.113.2'),false);assert.equal(selectLocalBearer({candidates}).kind,'wifi');});
