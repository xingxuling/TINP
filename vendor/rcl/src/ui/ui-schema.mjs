export const RCL_NATIVE_UI_VERSION = '0.1.0';
export const RCL_NATIVE_UI_FORMAT = 'rcl.native-ui.program.v0.1';
export const RCL_NATIVE_UI_WEB_FORMAT = 'rcl.native-ui.web-lowering.v0.1';
export const RCL_NATIVE_UI_ANDROID_FORMAT = 'rcl.native-ui.android-lowering.v0.1';
export const RCL_NATIVE_UI_NAVIGATION_FORMAT = 'rcl.native-ui.navigation.v0.1';
export const RCL_NATIVE_UI_DEVICE_ADAPTATION_FORMAT = 'rcl.native-ui.device-adaptation.v0.1';

export const UI_ROLES = Object.freeze(['container', 'text', 'action', 'input']);
export const UI_EVENT_TYPES = Object.freeze([
  'activate', 'input', 'change', 'submit', 'focus', 'blur', 'navigate',
  'create', 'resume', 'suspend', 'destroy', 'custom',
]);
export const UI_LIFECYCLE_STAGES = Object.freeze(['create', 'activate', 'suspend', 'resume', 'destroy']);
export const UI_LAYOUT_MODES = Object.freeze(['vertical', 'horizontal', 'overlay', 'grid']);
export const UI_SIZE_MODES = Object.freeze(['fill', 'intrinsic', 'fixed']);
export const UI_ALIGNMENTS = Object.freeze(['start', 'center', 'end', 'stretch']);
export const UI_DISTRIBUTIONS = Object.freeze(['start', 'center', 'end', 'space_between', 'space_around', 'space_evenly']);
export const UI_OVERFLOW_MODES = Object.freeze(['clip', 'scroll', 'visible']);
export const UI_SELECTOR_KINDS = Object.freeze(['role', 'class', 'node']);
export const UI_INHERITED_PROPERTIES = Object.freeze(['foreground', 'font_family', 'font_size', 'text_align', 'language']);
export const UI_STYLE_PROPERTIES = Object.freeze([
  'foreground', 'background', 'font_family', 'font_size', 'text_align', 'corner_radius', 'language',
]);
export const UI_CONTENT_PROPERTIES = Object.freeze(['value', 'label', 'placeholder', 'accessibility_label']);
export const UI_BINDABLE_PROPERTIES_BY_ROLE = Object.freeze({
  container: Object.freeze([]),
  text: Object.freeze(['value']),
  action: Object.freeze(['label']),
  input: Object.freeze(['value']),
});
export const UI_CONTENT_PROPERTIES_BY_ROLE = Object.freeze({
  container: Object.freeze(['accessibility_label']),
  text: Object.freeze(['value', 'accessibility_label']),
  action: Object.freeze(['label', 'accessibility_label']),
  input: Object.freeze(['value', 'placeholder', 'accessibility_label']),
});
export const UI_PROPERTY_TYPES = Object.freeze({
  value: 'Text',
  label: 'Text',
  placeholder: 'Text',
  accessibility_label: 'Text',
  foreground: 'Text',
  background: 'Text',
  font_family: 'Text',
  font_size: 'Number',
  text_align: 'Text',
  corner_radius: 'Number',
  language: 'Text',
});
export const UI_EVENT_PARAMETER_TYPES = Object.freeze({
  activate: Object.freeze({}),
  input: Object.freeze({ value: 'Text' }),
  change: Object.freeze({ value: 'Text' }),
  submit: Object.freeze({}),
  focus: Object.freeze({}),
  blur: Object.freeze({}),
  navigate: Object.freeze({ destination: 'Text' }),
  create: Object.freeze({}),
  resume: Object.freeze({}),
  suspend: Object.freeze({}),
  destroy: Object.freeze({}),
});
