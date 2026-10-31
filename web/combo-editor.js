import { parseNamedCombo, parseHidUsage, keyboardKeyLabel, formatNamedCombo } from '../src/keyboard.js';
import { keyBrowser } from './key-browser.js';

const drafts = new WeakMap();
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};
const button = (text, action) => {
  const node = element('button', 'btn secondary', text);
  node.type = 'button'; node.onclick = action;
  return node;
};

export function comboEditor({ item, index, label, presets, comboText, recording, onRecord, onChange }) {
  const combo = item.shortcuts[index] || [];
  let byKey = drafts.get(item);
  if (!byKey) { byKey = new Map(); drafts.set(item, byKey); }
  let draft = byKey.get(index);
  const signature = JSON.stringify(combo);
  if (!draft || draft.signature !== signature) {
    draft = { text: formatNamedCombo(combo), advanced: draft?.advanced || false, signature };
    byKey.set(index, draft);
  }
  const root = element('div', 'combo-editor');
  const error = element('p', 'combo-error');
  error.setAttribute('role', 'alert'); error.hidden = true;
  const fail = exception => { error.textContent = exception.message; error.hidden = false; };
  const apply = keys => { error.hidden = true; onChange(keys); };
  if (combo.length) {
    const chips = element('div', 'combo-chips');
    combo.forEach((key, keyIndex) => {
      const remove = button(`${keyboardKeyLabel(key)} ×`, () => apply(combo.filter((_, i) => i !== keyIndex)));
      remove.className = 'combo-chip';
      remove.setAttribute('aria-label', `Remove ${keyboardKeyLabel(key)} from combo`);
      remove.disabled = recording; chips.append(remove);
    });
    root.append(chips);
  }
  const form = element('form', 'combo-named');
  const fieldLabel = element('label', 'combo-field-label', 'Key or shortcut');
  const input = element('input'); input.type = 'text';
  input.id = `combo-name-${index}`; fieldLabel.htmlFor = input.id;
  input.setAttribute('aria-label', `${label} key or shortcut`);
  input.placeholder = 'F20 or Ctrl+Shift+F20'; input.autocomplete = 'off'; input.spellcheck = false;
  input.title = 'Modifiers: Ctrl, Shift, Alt/Option, Cmd/Win/Meta.';
  input.value = draft.text; input.disabled = recording;
  input.oninput = () => { draft.text = input.value; error.hidden = true; };
  const set = button('Set keys'); set.type = 'submit'; set.disabled = recording;
  form.onsubmit = event => { event.preventDefault(); try { apply(parseNamedCombo(input.value)); } catch (e) { fail(e); } };
  const row = element('div', 'combo-named-row'); row.append(input, set);
  form.append(fieldLabel, row, element('small', '', 'F1–F24, letters, arrows. Use + for combinations.'));
  root.append(form, error);
  root.append(keyBrowser({ id: index, disabled: recording, onPick: name => {
    input.value = name; draft.text = name; error.hidden = true; input.focus();
  } }));
  const alternatives = element('div', 'combo-alternatives');
  const record = button(recording ? 'Stop recording' : 'Record keys', onRecord);
  record.setAttribute('aria-pressed', String(recording));
  const clear = button('Clear', () => apply([])); clear.disabled = recording || !combo.length;
  alternatives.append(record, clear); root.append(alternatives);
  if (recording) root.append(element('small', 'combo-recording', 'Recording… Escape cancels. Stops after 5 seconds idle.'));
  const presetLabel = element('label', 'combo-field-label', 'Common shortcuts');
  const preset = element('select'); preset.id = `combo-preset-${index}`; presetLabel.htmlFor = preset.id;
  preset.setAttribute('aria-label', `${label} shortcut preset`); preset.disabled = recording;
  const placeholder = element('option', '', 'Choose a shortcut…'); placeholder.value = ''; preset.append(placeholder);
  for (const [value, name, keys] of presets) {
    const option = element('option', '', name); option.value = value; preset.append(option);
    if (JSON.stringify(combo) === JSON.stringify(keys)) preset.value = value;
  }
  preset.onchange = () => { const selected = presets.find(p => p[0] === preset.value); if (selected) apply(selected[2].map(k => ({ ...k }))); };
  root.append(presetLabel, preset);
  const advanced = element('details', 'combo-advanced'); advanced.open = draft.advanced;
  advanced.ontoggle = () => { draft.advanced = advanced.open; };
  advanced.append(element('summary', '', 'Advanced HID'));
  const kind = element('select'); kind.setAttribute('aria-label', `${label} HID kind`); kind.disabled = recording;
  for (const [value, text] of [[1,'Keyboard key'],[0,'Modifier mask']]) {
    const option = element('option', '', text); option.value = value; kind.append(option);
  }
  const raw = element('input'); raw.type = 'text'; raw.placeholder = '111 or 0x6F'; raw.disabled = recording;
  raw.setAttribute('aria-label', `${label} HID usage`);
  const add = button('Add HID key', () => {
    try {
      const key = { type: Number(kind.value), value: parseHidUsage(raw.value) };
      if (combo.some(k => k.type === key.type && k.value === key.value)) throw new Error('This key is already in the combo.');
      if (combo.length >= 5) throw new Error('A combo can contain up to five keys, including modifiers.');
      apply([...combo, key]);
    } catch (e) { fail(e); }
  }); add.disabled = recording;
  const rawRow = element('div', 'combo-hid-row'); rawRow.append(raw, add);
  advanced.append(kind, rawRow, element('small', '', 'USB HID keyboard page 0x07. F20 = 0x6F = 111. Modifier masks: Ctrl 1, Shift 2, Alt 4, Meta 8.'));
  root.append(advanced);
  return root;
}
