import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNamedCombo, parseHidUsage, keyboardEventKey, keyboardKeyLabel, formatNamedCombo } from '../src/keyboard.js';
import { em06DecodeShortcutRecord, em06ShortcutRecord } from '../src/em06.js';

test('F1 through F24 have USB HID usages, including F20 = 0x6F', () => {
  for (let i = 1; i <= 24; i++) assert.deepEqual(parseNamedCombo(`f${i}`), [{ type: 1, value: i <= 12 ? 57 + i : 91 + i }]);
  const keys = parseNamedCombo('F20');
  assert.deepEqual(keys, [{ type: 1, value: 111 }]);
  assert.deepEqual(em06DecodeShortcutRecord(em06ShortcutRecord(keys)), keys);
});

test('names, browser codes, and familiar aliases describe the same combination', () => {
  assert.deepEqual(parseNamedCombo('Ctrl+Shift+F20'), [{ type: 0, value: 1 }, { type: 0, value: 2 }, { type: 1, value: 111 }]);
  for (const modifier of ['Cmd','command','win','Super','Meta','⌘']) assert.deepEqual(parseNamedCombo(`${modifier}+f20`), [{ type: 0, value: 8 }, { type: 1, value: 111 }]);
  assert.deepEqual(parseNamedCombo('option+left_arrow'), [{ type: 0, value: 4 }, { type: 1, value: 80 }]);
  assert.deepEqual(parseNamedCombo('KeyA'), parseNamedCombo('a'));
  assert.deepEqual(parseNamedCombo('return_or_enter'), parseNamedCombo('Enter'));
  assert.deepEqual(parseNamedCombo('Ctrl+Control+F20'), parseNamedCombo('Ctrl+F20'));
  assert.deepEqual(parseNamedCombo('Numpad0'), [{ type: 1, value: 98 }]);
});

test('invalid names and oversized combos fail without generating a partial combo', () => {
  for (const text of ['', 'F25', 'Ctrl+', 'Ctrl++F20', 'F20junk', '111']) assert.throws(() => parseNamedCombo(text));
  assert.equal(parseNamedCombo('Ctrl+Shift+Alt+Meta+F20').length, 5);
  assert.throws(() => parseNamedCombo('Ctrl+Shift+Alt+Meta+F20+A'), /five keys/);
});

test('advanced HID input accepts only complete decimal/hex byte values', () => {
  for (const text of ['111','0x6f','0X6F',' 111 ']) assert.equal(parseHidUsage(text), 111);
  for (const text of ['','0x','0x6Fjunk','111junk','1.5','1e2','-1','256','0x100']) assert.throws(() => parseHidUsage(text));
});

test('recording and labels use the same key catalogue as named input', () => {
  assert.deepEqual(keyboardEventKey({ code: 'F20' }), parseNamedCombo('F20')[0]);
  assert.deepEqual(keyboardEventKey({ code: 'ControlRight' }), parseNamedCombo('RightCtrl')[0]);
  assert.equal(keyboardEventKey({ code: 'Unidentified' }), null);
  assert.equal(keyboardKeyLabel({ type: 1, value: 111 }), 'F20');
  assert.equal(formatNamedCombo(parseNamedCombo('Ctrl+F20')), 'Ctrl+F20');
  assert.equal(formatNamedCombo([{ type: 1, value: 255 }]), '');
  assert.equal(keyboardKeyLabel({ type: 1, value: 255 }), 'HID 0xFF');
  assert.equal(formatNamedCombo([{ type: 1, value: 4 }, { type: 1, value: 4 }]), '');
  assert.equal(formatNamedCombo([{ type: 2, value: 111 }]), '');
  assert.equal(formatNamedCombo([{ type: 0, value: 3 }]), '');
  assert.equal(keyboardKeyLabel({ type: 2, value: 111 }), 'HID type 2: 0x6F');
});
