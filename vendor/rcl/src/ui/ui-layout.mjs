import {
  UI_ALIGNMENTS,
  UI_DISTRIBUTIONS,
  UI_LAYOUT_MODES,
  UI_OVERFLOW_MODES,
  UI_SIZE_MODES,
} from './ui-schema.mjs';

function literal(expr, label) {
  if (!expr || expr.kind !== 'LiteralExpr') throw new Error(`RCL_UI_LAYOUT_LITERAL_REQUIRED:${label}`);
  return expr.value;
}

function size(value, axis) {
  const mode = value?.mode ?? 'intrinsic';
  if (!UI_SIZE_MODES.includes(mode)) throw new Error(`RCL_UI_LAYOUT_SIZE_MODE:${axis}:${mode}`);
  if (mode !== 'fixed') return { mode };
  const fixed = literal(value.value, axis);
  if (typeof fixed !== 'number' || !Number.isFinite(fixed) || fixed < 0) throw new Error(`RCL_UI_LAYOUT_FIXED_SIZE:${axis}`);
  return { mode, value: fixed };
}

function finiteNonNegative(expr, label, fallback = 0) {
  if (!expr) return fallback;
  const value = literal(expr, label);
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`RCL_UI_LAYOUT_NON_NEGATIVE:${label}`);
  return value;
}

export function normalizeUILayout(layout = null) {
  if (!layout) return Object.freeze({
    mode: 'vertical', width: { mode: 'fill' }, height: { mode: 'intrinsic' },
    gap: 0, padding: 0, alignment: 'stretch', distribution: 'start', overflow: 'visible', columns: 1,
  });
  if (!UI_LAYOUT_MODES.includes(layout.mode)) throw new Error(`RCL_UI_LAYOUT_MODE:${layout.mode}`);
  const alignment = layout.alignment ?? 'stretch';
  const distribution = layout.distribution ?? 'start';
  const overflow = layout.overflow ?? 'visible';
  if (!UI_ALIGNMENTS.includes(alignment)) throw new Error(`RCL_UI_LAYOUT_ALIGNMENT:${alignment}`);
  if (!UI_DISTRIBUTIONS.includes(distribution)) throw new Error(`RCL_UI_LAYOUT_DISTRIBUTION:${distribution}`);
  if (!UI_OVERFLOW_MODES.includes(overflow)) throw new Error(`RCL_UI_LAYOUT_OVERFLOW:${overflow}`);
  const columns = layout.columns ?? 1;
  if (!Number.isInteger(columns) || columns < 1) throw new Error(`RCL_UI_LAYOUT_COLUMNS:${columns}`);
  return Object.freeze({
    mode: layout.mode,
    width: size(layout.width ?? { mode: 'fill' }, 'width'),
    height: size(layout.height ?? { mode: 'intrinsic' }, 'height'),
    gap: finiteNonNegative(layout.gap, 'gap'),
    padding: finiteNonNegative(layout.padding, 'padding'),
    alignment,
    distribution,
    overflow,
    columns,
  });
}

