import { RCLRuntimeError } from './errors.mjs';

/**
 * Quantitative Reality kernel.
 *
 * A number is not yet a measurement. A measurement additionally carries a
 * quantity type, unit, uncertainty, confidence, scale and evidence lineage.
 */
export const QUANTITY_TYPES = new Set([
  'Length', 'Time', 'Mass', 'Velocity', 'Acceleration',
  'Force', 'Energy', 'Temperature', 'Frequency', 'Area',
  'Volume', 'Pressure', 'Power', 'Information',
]);

export const SIMPLE_TYPES = new Set([
  'Number', 'Text', 'Truth', 'SpacetimePoint', 'Element', 'Experiment', 'BodyState', 'SpiritState',
  'Sequence', 'Span', 'Token', 'AstNode', 'ParseState',
]);

const UNIT_BY_TYPE = {
  Length: 'm', Time: 's', Mass: 'kg', Velocity: 'm/s',
  Acceleration: 'm/s²', Force: 'N', Energy: 'J', Temperature: '°C',
  Frequency: 'Hz', Area: 'm²', Volume: 'm³', Pressure: 'Pa',
  Power: 'W', Information: 'bit',
};

export function isKnownBaseType(type) {
  return SIMPLE_TYPES.has(type) || QUANTITY_TYPES.has(type);
}

export function quantity(type, value, unit = UNIT_BY_TYPE[type]) {
  if (!QUANTITY_TYPES.has(type)) throw new TypeError(`Unknown quantity type '${type}'`);
  if (!Number.isFinite(value)) throw new TypeError(`Quantity '${type}' must be finite`);
  return Object.freeze({ kind: 'Quantity', type, value, unit: unit ?? UNIT_BY_TYPE[type] });
}

export function isQuantity(value) {
  return Boolean(value) && typeof value === 'object' && value.kind === 'Quantity' && QUANTITY_TYPES.has(value.type);
}

export function measurementType(baseType) { return `Measure<${baseType}>`; }
export function isMeasurementType(type) { return typeof type === 'string' && /^Measure<.+>$/.test(type); }
export function measurementBaseType(type) { return isMeasurementType(type) ? type.slice(8, -1) : null; }

export function measurement(baseType, value, options = {}) {
  if (!isKnownBaseType(baseType)) throw new TypeError(`Unknown measurement base type '${baseType}'`);
  const valueRuntimeType = runtimeType(value);
  if (valueRuntimeType !== baseType) {
    throw new RCLRuntimeError('RCL_MEASUREMENT_TYPE', `Measurement ${baseType} received ${valueRuntimeType}`, {
      baseType, actual: valueRuntimeType,
    });
  }
  const uncertaintyValue = options.uncertainty ?? (QUANTITY_TYPES.has(baseType) ? quantity(baseType, 0) : 0);
  const uncertaintyType = runtimeType(uncertaintyValue);
  if (uncertaintyType !== baseType && !(baseType === 'Text' || baseType === 'Truth')) {
    throw new RCLRuntimeError('RCL_UNCERTAINTY_TYPE', `Uncertainty for ${baseType} must be ${baseType}`, {
      baseType, actual: uncertaintyType,
    });
  }
  const confidence = Number(options.confidence ?? 1);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new RCLRuntimeError('RCL_CONFIDENCE_RANGE', 'Measurement confidence must be between 0 and 1', { confidence });
  }
  return Object.freeze({
    kind: 'Measurement',
    baseType,
    value,
    uncertainty: uncertaintyValue,
    confidence,
    unit: options.unit ?? (isQuantity(value) ? value.unit : null),
    scale: options.scale ?? 'ratio',
    evidence: [...(options.evidence ?? [])],
    calibratedBy: options.calibratedBy ?? null,
  });
}

export function isMeasurement(value) {
  return Boolean(value) && typeof value === 'object' && value.kind === 'Measurement' && isKnownBaseType(value.baseType);
}

export function runtimeType(value) {
  if (isMeasurement(value)) return measurementType(value.baseType);
  if (Boolean(value) && typeof value === 'object' && value.kind === 'Knowledge' && typeof value.baseType === 'string') return `Know<${value.baseType}>`;
  if (Boolean(value) && typeof value === 'object' && value.kind === 'SpacetimePoint') return 'SpacetimePoint';
  if (Boolean(value) && typeof value === 'object' && value.kind === 'ElementEntity') return 'Element';
  if (Boolean(value) && typeof value === 'object' && value.kind === 'ExperimentResult') return 'Experiment';
  if (Boolean(value) && typeof value === 'object' && value.kind === 'BodyState') return 'BodyState';
  if (Boolean(value) && typeof value === 'object' && value.kind === 'SpiritState') return 'SpiritState';
  if (Boolean(value) && typeof value === 'object' && value.kind === 'ScientificClaim' && typeof value.baseType === 'string') return `Science<${value.baseType}>`;
  if (Array.isArray(value)) return 'Sequence';
  if (Boolean(value) && typeof value === 'object' && value.kind === 'Span') return 'Span';
  if (Boolean(value) && typeof value === 'object' && value.kind === 'Token') return 'Token';
  if (Boolean(value) && typeof value === 'object' && value.kind === 'FacetDecl') return 'AstNode';
  if (Boolean(value) && typeof value === 'object' && value.kind === 'ParseState') return 'ParseState';
  if (isQuantity(value)) return value.type;
  if (typeof value === 'number') return 'Number';
  if (typeof value === 'string') return 'Text';
  if (typeof value === 'boolean') return 'Truth';
  return 'Unknown';
}

const MULTIPLY = new Map([
  ['Length*Length', 'Area'],
  ['Area*Length', 'Volume'], ['Length*Area', 'Volume'],
  ['Acceleration*Time', 'Velocity'], ['Time*Acceleration', 'Velocity'],
  ['Velocity*Time', 'Length'], ['Time*Velocity', 'Length'],
  ['Mass*Acceleration', 'Force'], ['Acceleration*Mass', 'Force'],
  ['Force*Length', 'Energy'], ['Length*Force', 'Energy'],
  ['Energy/Time', 'Power'],
  ['Pressure*Area', 'Force'], ['Area*Pressure', 'Force'],
]);

const DIVIDE = new Map([
  ['Length/Time', 'Velocity'], ['Velocity/Time', 'Acceleration'],
  ['Force/Mass', 'Acceleration'], ['Energy/Length', 'Force'],
  ['Energy/Time', 'Power'], ['Force/Area', 'Pressure'],
  ['Number/Time', 'Frequency'],
]);

export function inferBinaryType(operator, left, right) {
  if (['==', '!='].includes(operator)) return left === right ? 'Truth' : null;
  if (['<', '<=', '>', '>='].includes(operator)) {
    return left === right && (left === 'Number' || QUANTITY_TYPES.has(left)) ? 'Truth' : null;
  }
  if (operator === '+' || operator === '-') {
    if (operator === '+' && left === 'Text' && right === 'Text') return 'Text';
    return left === right && (left === 'Number' || QUANTITY_TYPES.has(left)) ? left : null;
  }
  if (operator === '*') {
    if (left === 'Number' && (right === 'Number' || QUANTITY_TYPES.has(right))) return right;
    if (right === 'Number' && QUANTITY_TYPES.has(left)) return left;
    return MULTIPLY.get(`${left}*${right}`) ?? null;
  }
  if (operator === '/') {
    if (right === 'Number' && (left === 'Number' || QUANTITY_TYPES.has(left))) return left;
    if (left === right && QUANTITY_TYPES.has(left)) return 'Number';
    return DIVIDE.get(`${left}/${right}`) ?? null;
  }
  if (operator === '%') return left === 'Number' && right === 'Number' ? 'Number' : null;
  return null;
}

function sameQuantity(left, right, operator) {
  if (!isQuantity(left) || !isQuantity(right) || left.type !== right.type) {
    throw new RCLRuntimeError('RCL_DIMENSION_MISMATCH', `${operator} requires matching physical dimensions`, {
      left: runtimeType(left), right: runtimeType(right), operator,
    });
  }
}

export function applyBinary(operator, left, right) {
  if (operator === '==' || operator === '!=') {
    const equal = isQuantity(left) && isQuantity(right)
      ? left.type === right.type && left.value === right.value
      : left === right;
    return operator === '==' ? equal : !equal;
  }
  if (['<', '<=', '>', '>='].includes(operator)) {
    let a = left; let b = right;
    if (isQuantity(left) || isQuantity(right)) {
      sameQuantity(left, right, operator); a = left.value; b = right.value;
    }
    if (operator === '<') return a < b;
    if (operator === '<=') return a <= b;
    if (operator === '>') return a > b;
    return a >= b;
  }
  if (operator === '+' || operator === '-') {
    if (typeof left === 'string' && typeof right === 'string' && operator === '+') return left + right;
    if (isQuantity(left) || isQuantity(right)) {
      sameQuantity(left, right, operator);
      return quantity(left.type, operator === '+' ? left.value + right.value : left.value - right.value, left.unit);
    }
    return operator === '+' ? left + right : left - right;
  }
  if (operator === '*') {
    if (typeof left === 'number' && isQuantity(right)) return quantity(right.type, left * right.value, right.unit);
    if (isQuantity(left) && typeof right === 'number') return quantity(left.type, left.value * right, left.unit);
    if (isQuantity(left) && isQuantity(right)) {
      const resultType = MULTIPLY.get(`${left.type}*${right.type}`);
      if (!resultType) throw new RCLRuntimeError('RCL_DIMENSION_MISMATCH', `Cannot multiply ${left.type} by ${right.type}`);
      return quantity(resultType, left.value * right.value);
    }
    return left * right;
  }
  if (operator === '/') {
    if (isQuantity(left) && typeof right === 'number') return quantity(left.type, left.value / right, left.unit);
    if (isQuantity(left) && isQuantity(right)) {
      if (left.type === right.type) return left.value / right.value;
      const resultType = DIVIDE.get(`${left.type}/${right.type}`);
      if (!resultType) throw new RCLRuntimeError('RCL_DIMENSION_MISMATCH', `Cannot divide ${left.type} by ${right.type}`);
      return quantity(resultType, left.value / right.value);
    }
    if (typeof left === 'number' && isQuantity(right) && right.type === 'Time') return quantity('Frequency', left / right.value);
    return left / right;
  }
  if (operator === '%') return left % right;
  throw new RCLRuntimeError('RCL_OPERATOR_UNKNOWN', `Unknown operator '${operator}'`);
}

export function lowerBound(value) {
  if (!isMeasurement(value)) throw new RCLRuntimeError('RCL_EXPECTED_MEASUREMENT', 'lower() expects a measurement');
  return applyBinary('-', value.value, value.uncertainty);
}

export function upperBound(value) {
  if (!isMeasurement(value)) throw new RCLRuntimeError('RCL_EXPECTED_MEASUREMENT', 'upper() expects a measurement');
  return applyBinary('+', value.value, value.uncertainty);
}

export const quantityConstructors = {
  meters: value => quantity('Length', value),
  seconds: value => quantity('Time', value),
  kilograms: value => quantity('Mass', value),
  meters_per_second: value => quantity('Velocity', value),
  meters_per_second2: value => quantity('Acceleration', value),
  newtons: value => quantity('Force', value),
  joules: value => quantity('Energy', value),
  celsius: value => quantity('Temperature', value),
  hertz: value => quantity('Frequency', value),
  square_meters: value => quantity('Area', value),
  cubic_meters: value => quantity('Volume', value),
  pascals: value => quantity('Pressure', value),
  watts: value => quantity('Power', value),
  bits: value => quantity('Information', value),
};

export const quantityConstructorTypes = {
  meters: 'Length', seconds: 'Time', kilograms: 'Mass',
  meters_per_second: 'Velocity', meters_per_second2: 'Acceleration',
  newtons: 'Force', joules: 'Energy', celsius: 'Temperature',
  hertz: 'Frequency', square_meters: 'Area', cubic_meters: 'Volume',
  pascals: 'Pressure', watts: 'Power', bits: 'Information',
};
