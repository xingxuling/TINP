import os from 'node:os';

export const LOCAL_FIRST_POLICY = Object.freeze({
  mode: 'local-first',
  allowLoopback: true,
  allowLocalLan: true,
  allowLinkLocal: true,
  allowPublicInternet: false,
  allowMetered: false,
});

function cleanHost(host) {
  if (typeof host !== 'string') return '';
  let value = host.trim().toLowerCase();
  if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1);
  const zone = value.indexOf('%');
  if (zone !== -1) value = value.slice(0, zone);
  return value;
}

function ipv4Parts(host) {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map(x => Number(x));
  if (nums.some((x, i) => !/^\d{1,3}$/.test(parts[i]) || x < 0 || x > 255)) return null;
  return nums;
}

export function classifyNetworkHost(host) {
  const h = cleanHost(host);
  if (!h) return { host: h, scope: 'invalid', local: false };
  if (h === 'localhost' || h === '::1' || h === '127.0.0.1') return { host: h, scope: 'loopback', local: true };
  if (h === '0.0.0.0' || h === '::') return { host: h, scope: 'unspecified', local: false };

  const v4 = ipv4Parts(h);
  if (v4) {
    const [a,b] = v4;
    if (a === 127) return { host: h, scope: 'loopback', local: true, family: 'IPv4' };
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
      return { host: h, scope: 'lan', local: true, family: 'IPv4' };
    }
    if (a === 169 && b === 254) return { host: h, scope: 'link-local', local: true, family: 'IPv4' };
    return { host: h, scope: 'public', local: false, family: 'IPv4' };
  }

  if (h.includes(':')) {
    if (h === '::1') return { host: h, scope: 'loopback', local: true, family: 'IPv6' };
    if (/^f[cd][0-9a-f]{0,2}:/i.test(h)) return { host: h, scope: 'lan', local: true, family: 'IPv6' };
    if (/^fe[89ab][0-9a-f]?:/i.test(h)) return { host: h, scope: 'link-local', local: true, family: 'IPv6' };
    return { host: h, scope: 'public', local: false, family: 'IPv6' };
  }

  return { host: h, scope: 'hostname', local: false };
}

export function inferBearerKind(interfaceName='') {
  const name = String(interfaceName).toLowerCase();
  if (/(wi-?fi|wlan|wlp|wlx|airport|wireless|无线)/.test(name)) return 'wifi';
  if (/(ethernet|eth\d|enp|eno|ens|lan|以太)/.test(name)) return 'ethernet';
  if (/(vpn|wireguard|^wg\d|tun\d|tap\d|tailscale|zerotier)/.test(name)) return 'overlay';
  return 'network';
}

export function endpointPolicy(endpoint, policy=LOCAL_FIRST_POLICY) {
  const merged = {...LOCAL_FIRST_POLICY, ...(policy ?? {})};
  const classification = classifyNetworkHost(endpoint?.host);
  let allowed = false;
  let code = 'NETWORK_ENDPOINT_DENIED';
  if (classification.scope === 'loopback' && merged.allowLoopback) { allowed = true; code = 'LOCAL_LOOPBACK_ALLOWED'; }
  else if (classification.scope === 'lan' && merged.allowLocalLan) { allowed = true; code = 'LOCAL_LAN_ALLOWED'; }
  else if (classification.scope === 'link-local' && merged.allowLinkLocal) { allowed = true; code = 'LOCAL_LINK_ALLOWED'; }
  else if ((classification.scope === 'public' || classification.scope === 'hostname') && merged.allowPublicInternet) { allowed = true; code = 'PUBLIC_EGRESS_EXPLICITLY_ALLOWED'; }
  else if (classification.scope === 'public' || classification.scope === 'hostname') code = 'PUBLIC_EGRESS_DENIED';
  else if (classification.scope === 'unspecified') code = 'UNSPECIFIED_ENDPOINT_DENIED';
  else if (classification.scope === 'invalid') code = 'INVALID_ENDPOINT';

  const metered = Boolean(endpoint?.metered);
  if (allowed && metered && !merged.allowMetered) { allowed = false; code = 'METERED_LINK_DENIED'; }
  return {allowed, code, classification, metered, policy: merged};
}

export function enumerateLocalBearers(interfaces=os.networkInterfaces()) {
  const out = [];
  for (const [name, entries] of Object.entries(interfaces ?? {})) {
    for (const entry of entries ?? []) {
      const family = typeof entry.family === 'number' ? (entry.family === 4 ? 'IPv4' : entry.family === 6 ? 'IPv6' : String(entry.family)) : entry.family;
      if (entry.internal || !entry.address || !['IPv4','IPv6'].includes(family)) continue;
      const classification = classifyNetworkHost(entry.address);
      if (!['lan','link-local'].includes(classification.scope)) continue;
      const kind = inferBearerKind(name);
      out.push({
        id: `${kind}:${name}:${entry.address}`,
        interfaceName: name,
        address: entry.address,
        family,
        kind,
        scope: classification.scope,
        metered: false,
        publicEgress: false,
        monetaryCost: 0,
      });
    }
  }
  return out.sort((a,b)=>bearerScore(b)-bearerScore(a)||a.id.localeCompare(b.id));
}

export function bearerScore(candidate) {
  const kind = candidate?.kind;
  let score = kind === 'wifi' ? 500 : kind === 'ethernet' ? 450 : kind === 'overlay' ? 250 : 300;
  if (candidate?.scope === 'lan') score += 100;
  if (candidate?.family === 'IPv4') score += 20;
  if (candidate?.metered) score -= 400;
  if (candidate?.publicEgress) score -= 500;
  return score;
}

export function selectLocalBearer({interfaces=os.networkInterfaces(), candidates=null, preferKinds=['wifi','ethernet','network','overlay']}={}) {
  const pool = [...(candidates ?? enumerateLocalBearers(interfaces))];
  const preference = new Map(preferKinds.map((x,i)=>[x, preferKinds.length-i]));
  pool.sort((a,b)=>((preference.get(b.kind)??0)-(preference.get(a.kind)??0))||bearerScore(b)-bearerScore(a)||a.id.localeCompare(b.id));
  const selected = pool[0];
  if (!selected) {
    const error = new Error('NO_LOCAL_BEARER'); error.code = 'NO_LOCAL_BEARER'; throw error;
  }
  return selected;
}

export function makeBearerAdmissionFacts({endpoint, policy=LOCAL_FIRST_POLICY, reachable=true, securityFloorMet=true, privacyFloorMet=true}={}) {
  const decision = endpointPolicy(endpoint, policy);
  const localFirstSatisfied = decision.classification.local || Boolean(decision.policy.allowPublicInternet);
  return {
    endpointPolicyMet: decision.allowed,
    meteringPolicyMet: !decision.metered || Boolean(decision.policy.allowMetered),
    routeReachable: Boolean(reachable),
    securityFloorMet: Boolean(securityFloorMet),
    privacyFloorMet: Boolean(privacyFloorMet),
    localFirstSatisfied: Boolean(localFirstSatisfied),
  };
}
