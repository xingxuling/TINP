import { UI_LIFECYCLE_STAGES } from './ui-schema.mjs';

export function normalizeUiLifecycle(value, stateIds) {
  const stages = value?.stages?.length ? [...new Set(value.stages)] : [...UI_LIFECYCLE_STAGES];
  for (const stage of stages) if (!UI_LIFECYCLE_STAGES.includes(stage)) throw new Error(`RCL_UI_LIFECYCLE_STAGE:${stage}`);
  const restore = [...new Set(value?.restore ?? [])];
  for (const id of restore) if (!stateIds.has(id)) throw new Error(`RCL_UI_LIFECYCLE_RESTORE_UNKNOWN:${id}`);
  return Object.freeze({ stages, restore });
}

