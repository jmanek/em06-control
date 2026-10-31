// USB HID keyboard/keypad usage page 0x07. Names describe physical keys;
// characters produced by punctuation keys depend on the host keyboard layout.
// Reference: https://usb.org/sites/default/files/hut1_5.pdf, section 10.
export const KEYBOARD_KEYS = [
  ...Array.from({ length: 26 }, (_, i) => ({ name: String.fromCharCode(65 + i), value: 4 + i, code: `Key${String.fromCharCode(65 + i)}` })),
  ...Array.from({ length: 10 }, (_, i) => ({ name: String((i + 1) % 10), value: 30 + i, code: `Digit${(i + 1) % 10}` })),
  ...[
    ['Enter',40],['Escape',41],['Backspace',42],['Tab',43],['Space',44],
    ['Minus',45],['Equal',46],['BracketLeft',47],['BracketRight',48],['Backslash',49],
    ['NonUSHash',50],['Semicolon',51],['Quote',52],['Backquote',53],['Comma',54],['Period',55],['Slash',56],['CapsLock',57],
    ['PrintScreen',70],['ScrollLock',71],['Pause',72],['Insert',73],['Home',74],['PageUp',75],['Delete',76],['End',77],['PageDown',78],
    ['ArrowRight',79],['ArrowLeft',80],['ArrowDown',81],['ArrowUp',82],['NumLock',83],
    ['NumpadDivide',84],['NumpadMultiply',85],['NumpadSubtract',86],['NumpadAdd',87],['NumpadEnter',88],
    ...Array.from({ length: 9 }, (_, i) => [`Numpad${i + 1}`,89 + i]),
    ['Numpad0',98],['NumpadDecimal',99],['IntlBackslash',100],['ContextMenu',101],['Power',102],['NumpadEqual',103],
  ].map(([name,value]) => ({ name, value, code: name })),
  ...Array.from({ length: 24 }, (_, i) => ({ name: `F${i + 1}`, value: i < 12 ? 58 + i : 104 + i - 12, code: `F${i + 1}` })),
];

const modifiers = [
  { name: 'Ctrl', value: 1, codes: ['ControlLeft'], aliases: ['control','ctl','left_control','left_ctrl','⌃'] },
  { name: 'Shift', value: 2, codes: ['ShiftLeft'], aliases: ['left_shift','⇧'] },
  { name: 'Alt', value: 4, codes: ['AltLeft'], aliases: ['option','opt','left_alt','left_option','⌥'] },
  { name: 'Meta', value: 8, codes: ['MetaLeft'], aliases: ['cmd','command','win','windows','super','left_command','left_meta','⌘'] },
  { name: 'RightCtrl', value: 16, codes: ['ControlRight'], aliases: ['right_control','right_ctrl'] },
  { name: 'RightShift', value: 32, codes: ['ShiftRight'], aliases: ['right_shift'] },
  { name: 'RightAlt', value: 64, codes: ['AltRight'], aliases: ['right_alt','right_option'] },
  { name: 'RightMeta', value: 128, codes: ['MetaRight'], aliases: ['right_command','right_meta'] },
];
const token = value => value.toLowerCase().replace(/[\s_-]/g, '');
const names = new Map();
const codes = new Map();
for (const key of KEYBOARD_KEYS) {
  for (const name of [key.name,key.code]) names.set(token(name), { type: 1, value: key.value });
  codes.set(key.code, { type: 1, value: key.value });
}
for (const modifier of modifiers) {
  for (const name of [modifier.name,...modifier.aliases,...modifier.codes]) names.set(token(name), { type: 0, value: modifier.value });
  for (const code of modifier.codes) codes.set(code, { type: 0, value: modifier.value });
}
for (const [alias,name] of Object.entries({
  esc:'Escape',return:'Enter',return_or_enter:'Enter',spacebar:'Space',del:'Delete',
  left:'ArrowLeft',left_arrow:'ArrowLeft',right:'ArrowRight',right_arrow:'ArrowRight',
  up:'ArrowUp',up_arrow:'ArrowUp',down:'ArrowDown',down_arrow:'ArrowDown',
  page_up:'PageUp',page_down:'PageDown',equal_sign:'Equal',open_bracket:'BracketLeft',close_bracket:'BracketRight',
  grave_accent_and_tilde:'Backquote',hyphen:'Minus',decimal:'NumpadDecimal',application:'ContextMenu',
})) names.set(token(alias), names.get(token(name)));

export function parseNamedCombo(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Enter a key, such as F20 or Ctrl+Shift+F20.');
  const result = [];
  for (const part of text.split('+')) {
    const name = part.trim();
    const key = names.get(token(name));
    if (!key) throw new Error(`Unknown key “${name}”. Choose a suggested key or use Advanced HID.`);
    if (!result.some(k => k.type === key.type && k.value === key.value)) result.push({ ...key });
  }
  if (result.length > 5) throw new Error('A combo can contain up to five keys, including modifiers.');
  return result;
}

export function parseHidUsage(text) {
  const value = typeof text === 'string' ? text.trim() : '';
  if (!/^(?:0x[0-9a-f]{1,2}|\d{1,3})$/i.test(value) || Number(value) > 255) {
    throw new Error('Enter a HID usage from 0 to 255 in decimal or hex, such as 111 or 0x6F.');
  }
  return Number(value);
}

export function keyboardEventKey(event) {
  const key = codes.get(event.code);
  return key ? { ...key } : null;
}

export function keyboardKeyLabel(key) {
  if (key.type === 0) return modifiers.find(m => m.value === key.value)?.name || `Modifier 0x${key.value.toString(16).toUpperCase()}`;
  if (key.type !== 1) return `HID type ${key.type}: 0x${key.value.toString(16).toUpperCase()}`;
  return KEYBOARD_KEYS.find(k => k.value === key.value)?.name || `HID 0x${key.value.toString(16).toUpperCase()}`;
}

export function formatNamedCombo(keys) {
  const text = (keys || []).map(keyboardKeyLabel).join('+');
  // Unknown raw values remain visible in chips; never replace them with a
  // misleading name or imply that the named parser can interpret them.
  try {
    const parsed = parseNamedCombo(text);
    return parsed.length === keys.length && parsed.every((key, i) => key.type === keys[i].type && key.value === keys[i].value) ? text : '';
  } catch { return ''; }
}
