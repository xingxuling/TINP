import {rootHash, TinpError} from './canonical.mjs';

export class CapabilityRouter {
  constructor() { this.providers = new Map(); }
  register(manifest) {
    if (!manifest?.providerId) throw new TinpError('PROVIDER_ID_REQUIRED');
    if (this.providers.has(manifest.providerId)) throw new TinpError('PROVIDER_DUPLICATE');
    const normalized = {
      providerId: manifest.providerId,
      capabilities: [...new Set(manifest.capabilities ?? [])].sort(),
      payloadProfiles: [...new Set(manifest.payloadProfiles ?? ['application/json'])].sort(),
      authorityScopes: [...new Set(manifest.authorityScopes ?? [])].sort(),
      securityProfiles: [...new Set(manifest.securityProfiles ?? ['none-test'])].sort(),
      priority: Number(manifest.priority ?? 0),
      handler: manifest.handler
    };
    normalized.manifestRoot = rootHash({...normalized, handler: undefined});
    this.providers.set(normalized.providerId, normalized);
    return normalized;
  }
  candidates(capability, {payloadProfile, authorityScope, securityProfile} = {}) {
    return [...this.providers.values()].filter(p =>
      p.capabilities.includes(capability) &&
      (!payloadProfile || p.payloadProfiles.includes(payloadProfile)) &&
      (!authorityScope || p.authorityScopes.includes(authorityScope)) &&
      (!securityProfile || p.securityProfiles.includes(securityProfile))
    ).sort((a,b)=> b.priority-a.priority || a.providerId.localeCompare(b.providerId));
  }
  route(capability, constraints={}) {
    const matches = this.candidates(capability, constraints);
    if (!matches.length) throw new TinpError('CAPABILITY_UNROUTABLE', {capability, constraints});
    return matches[0];
  }
}
