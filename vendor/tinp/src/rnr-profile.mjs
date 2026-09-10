import {rootHash, TinpError} from './canonical.mjs';

export const RNR_PAYLOAD_PROFILE='rncs.network-runtime.v0.1';
export function wrapRnrPacket(packet){
  if(!packet?.format?.startsWith('network.')) throw new TinpError('RNR_PACKET_FORMAT_REQUIRED');
  const base={format:'tinp.rnr-payload.v0.1',payloadProfile:RNR_PAYLOAD_PROFILE,packet};
  return {...base,payloadRoot:rootHash(base)};
}
