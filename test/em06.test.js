import test from 'node:test';
import assert from 'node:assert/strict';
import { Em06Hub, EM06, Em06MouseCodec, MockTransport, ProfileStore, ReportCapture, UnlearnedCodec, em06Checksum, em06DecodeMacroName, em06DecodeShortcutRecord, em06FlashChecksum, em06GetFirmwareVersion, em06KeyRecord, em06MacroNameRecord, em06ProfileCycleKey, em06ReadFlash, em06SelectProfile, em06ShortcutRecord } from '../src/em06.js';
import { Em06Mouse, WebHidTransport } from '../src/webhid.js';
import { Em06SimulatorTransport } from '../src/simulator.js';

test('profile cycle is exactly 0 -> 1 -> 2 -> 3 -> 0', () => {
  const store = new ProfileStore();
  assert.deepEqual([store.cycle(), store.cycle(), store.cycle(), store.cycle()], [1, 2, 3, 0]);
});

test('profiles are isolated and copied at the boundary', () => {
  const store = new ProfileStore();
  const map = { left: 'copy' };
  store.set(2, map);
  map.left = 'mutated';
  assert.equal(store.currentAt(2).left, 'copy');
});

test('capture export/import preserves raw report bytes', () => {
  const capture = new ReportCapture();
  capture.record('out', 5, Uint8Array.from([0, 1, 255]));
  assert.deepEqual(ReportCapture.import(capture.export()).events, capture.events);
});

test('unlearned codec refuses writes', async () => {
  const transport = new MockTransport();
  const hub = new Em06Hub({ transport, codec: new UnlearnedCodec() });
  await hub.connect();
  await assert.rejects(() => hub.writeProfile(0, { left: 'click' }), /unlearned/);
  assert.deepEqual(transport.writes, []);
});

test('EM06 command frames use report 8 and an adjusted checksum', () => {
  const frame = em06SelectProfile(3);
  assert.equal(frame.length, 16);
  assert.deepEqual([...frame.slice(0, 6)], [EM06.commands.setCurrentProfile, 0, 0, 0, 1, 3]);
  assert.equal(frame[15], em06Checksum(frame));
  assert.equal(frame[15] !== 0, true);
  assert.equal(frame[15 - 0], frame[15]);
  assert.equal(frame[15] !== EM06.initialTail, true);
});

test('EM06 firmware version request uses the Hub version command', () => {
  const frame = em06GetFirmwareVersion();
  assert.deepEqual([...frame.slice(0, 5)], [EM06.commands.readVersionId, 0, 0, 0, 0]);
  assert.equal(frame[15], em06Checksum(frame));
});

test('EM06 flash reads encode big-endian address and length', () => {
  const frame = em06ReadFlash(0x0123, 10);
  assert.deepEqual([...frame.slice(0, 5)], [EM06.commands.readFlash, 0, 1, 0x23, 10]);
  assert.equal(frame[15 - 0], em06Checksum(frame));
  assert.equal(frame[15], frame[15]);
});

test('codec emits 10-byte flash write chunks', () => {
  const reports = new Em06MouseCodec().encodeProfile(0, { keys: [{ type: 1, param: 1 }, { type: 9, param: 0 }] });
  assert.equal(reports.length, 3);
  assert.deepEqual([...reports[1].slice(2, 5)], [0, EM06.mouseFlash.keys, 4]);
  assert.deepEqual([...reports[1].slice(5, 9)], [...em06KeyRecord(1, 1)]);
  assert.equal(reports[0][0], EM06.commands.setCurrentProfile);
});

test('codec preserves sparse EM06 physical key slots', () => {
  const reports = new Em06MouseCodec().encodeProfile(0, { keys: [{ type: 1, param: 1, slot: 0 }, { type: 8, param: 0, slot: 11 }] });
  assert.deepEqual([...reports[2].slice(2, 5)], [0, EM06.mouseFlash.keys + 44, 4]);
  assert.deepEqual([...reports[2].slice(5, 9)], [...em06KeyRecord(8, 0)]);
});

test('shortcut records round-trip HID key sequences and preserve sparse slots', () => {
  const combo = [{ type: 0, value: 1 }, { type: 1, value: 6 }];
  assert.deepEqual(em06DecodeShortcutRecord(em06ShortcutRecord(combo)), combo);
  const reports = new Em06MouseCodec().encodeProfile(0, { keys: [{ type: 5, param: 0, slot: 11 }], shortcuts: [{ slot: 11, keys: combo }] });
  assert.deepEqual([...reports[2].slice(2, 5)], [(EM06.mouseFlash.shortcut + 11 * 32) >>> 8, (EM06.mouseFlash.shortcut + 11 * 32) & 0xff, 10]);
  const record = Uint8Array.from([...reports[2].slice(5, 15), ...reports[3].slice(5, 9)]);
  assert.deepEqual(em06DecodeShortcutRecord(record), combo);
});

test('macro names use the Hub 31-byte record', () => {
  const record = em06MacroNameRecord('Copy / Paste');
  assert.equal(record.length, 31);
  assert.equal(em06DecodeMacroName(record), 'Copy / Paste');
});

test('key records use the Hub key type, big-endian parameter, and local checksum', () => {
  assert.deepEqual([...em06ProfileCycleKey(0)], [9, 0, 1, 0x4b]);
  assert.deepEqual([...em06ProfileCycleKey(1)], [9, 0, 2, 0x4a]);
  assert.deepEqual([...em06ProfileCycleKey(2)], [9, 0, 3, 0x49]);
  const record = em06ProfileCycleKey(3);
  assert.deepEqual([...record], [9, 0, 0, 0x4c]);
  assert.equal(record[3], em06FlashChecksum(record));
});

test('simulator verifies profile isolation, key writes, reads, and cycling', async () => {
  const transport = new Em06SimulatorTransport();
  const mouse = new Em06Mouse(transport);
  await mouse.connect();
  await mouse.writeKeymap(0, { keys: [{ type: 1, param: 1 }] });
  const p0 = await mouse.readFlash(EM06.mouseFlash.keys, 4);
  assert.deepEqual([...p0], [...em06KeyRecord(1, 1)]);
  await mouse.cycleProfile();
  assert.equal(mouse.profile, 1);
  const p1 = await mouse.readFlash(EM06.mouseFlash.keys, 4);
  assert.deepEqual([...p1], [0, 0, 0, 0]);
});

test('WebHID transport ignores unrelated reports while waiting', async () => {
  class FakeDevice extends EventTarget {
    constructor() { super(); this.opened = false; }
    async open() { this.opened = true; }
    async sendReport(reportId, frame) {
      const emit = (bytes) => {
        const event = new Event('inputreport');
        Object.defineProperties(event, {
          reportId: { value: reportId },
          data: { value: { buffer: Uint8Array.from(bytes).buffer } },
        });
        this.dispatchEvent(event);
      };
      setTimeout(() => { emit(Uint8Array.from([EM06.commands.readFlash, 0, 0, 0, 1])); emit(frame); }, 0);
    }
  }
  const device = new FakeDevice();
  const transport = new WebHidTransport(device, { timeoutMs: 100 });
  await transport.connect();
  const request = em06SelectProfile(2);
  const response = await transport.send(request);
  assert.equal(response[0], EM06.commands.setCurrentProfile);
});
