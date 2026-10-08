/**
 * EM06 protocol-independent hub core.
 *
 * The browser hub uses WebHID, but the vendor report layout is not published.
 * Keep transport and report codec separate so captured reports can be added
 * without changing profile/keymap semantics.
 */

export const PROFILE_COUNT = 4;
export const BUTTON_COUNT = 7;

export class ProfileStore {
  constructor(profiles = Array.from({ length: PROFILE_COUNT }, () => ({})), active = 0) {
    if (!Array.isArray(profiles) || profiles.length !== PROFILE_COUNT) {
      throw new RangeError(`expected exactly ${PROFILE_COUNT} profiles`);
    }
    this.profiles = profiles.map((p) => structuredClone(p));
    this.active = normalizeProfile(active);
  }

  current() { return structuredClone(this.profiles[this.active]); }

  set(profile, keymap) {
    const index = normalizeProfile(profile);
    this.profiles[index] = structuredClone(keymap);
    return this.currentAt(index);
  }

  currentAt(profile) {
    const index = normalizeProfile(profile);
    return structuredClone(this.profiles[index]);
  }

  cycle() {
    this.active = (this.active + 1) % PROFILE_COUNT;
    return this.active;
  }
}

export function normalizeProfile(profile) {
  if (!Number.isInteger(profile) || profile < 0 || profile >= PROFILE_COUNT) {
    throw new RangeError(`profile must be an integer from 0 to ${PROFILE_COUNT - 1}`);
  }
  return profile;
}

export class ReportCapture {
  constructor() { this.events = []; }
  record(direction, reportId, data) {
    if (!['in', 'out'].includes(direction)) throw new TypeError('direction must be in or out');
    this.events.push({ direction, reportId, data: [...data] });
  }
  export() { return JSON.stringify({ version: 1, events: this.events }, null, 2); }
  static import(text) {
    const value = JSON.parse(text);
    if (value?.version !== 1 || !Array.isArray(value.events)) throw new Error('invalid capture');
    const capture = new ReportCapture();
    for (const e of value.events) capture.record(e.direction, e.reportId, e.data);
    return capture;
  }
}

export class Em06Hub {
  constructor({ transport, codec, profiles } = {}) {
    if (!transport) throw new TypeError('transport is required');
    if (!codec) throw new TypeError('codec is required');
    this.transport = transport;
    this.codec = codec;
    this.store = profiles ?? new ProfileStore();
  }

  async connect() { return this.transport.connect(); }
  async disconnect() { return this.transport.disconnect(); }

  async readState() {
    return this.codec.decodeState(await this.transport.readFeatureReports());
  }

  async writeProfile(profile, keymap) {
    const index = normalizeProfile(profile);
    const reports = this.codec.encodeProfile(index, keymap);
    await this.transport.writeFeatureReports(reports);
    this.store.set(index, keymap);
  }

  async cycleProfile() {
    const next = this.store.cycle();
    const report = this.codec.encodeProfileSelect(next);
    await this.transport.writeFeatureReports(report);
    return next;
  }
}

// A deliberately strict placeholder codec. It prevents accidental writes until
// descriptor/report captures identify the actual EM06 protocol.
export class UnlearnedCodec {
  decodeState() { throw new Error('EM06 report codec is unlearned; connect in capture mode first'); }
  encodeProfile() { throw new Error('EM06 report codec is unlearned; refusing to write'); }
  encodeProfileSelect() { throw new Error('EM06 report codec is unlearned; refusing to write'); }
}

// Extracted from the shipped ProtoArc Hub bundle. The mouse transport uses
// WebHID report ID 8 and 16-byte command frames. This codec only covers the
// common EM06 mouse path: online/status, profile select, and flash access.
export const EM06 = Object.freeze({
  reportId: 8,
  frameSize: 16,
  // The Hub initializes byte 15 to 0xef, then replaces it with the adjusted
  // checksum before sending. 0xef is therefore not present on the wire.
  initialTail: 0xef,
  commands: Object.freeze({
    encryptionData: 1,
    deviceOnline: 3,
    readFlash: 8,
    getCurrentProfile: 14,
    setCurrentProfile: 15,
  }),
  mouseFlash: Object.freeze({
    reportRate: 0,
    dpi: 12,
    keys: 96,
    shortcut: 256,
    macro: 768,
    sensor3955Dpi: 6912,
    endEeprom: 6987,
  }),
  keyFunction: Object.freeze({
    disable: 0,
    mouseKey: 1,
    dpiSwitch: 2,
    leftRightRoll: 3,
    fireKey: 4,
    shortcut: 5,
    macro: 6,
    reportRateSwitch: 7,
    lightSwitch: 8,
    profileSwitch: 9,
    dpiLock: 10,
    upDownRoll: 11,
  }),
});

export function em06Checksum(frame) {
  let sum = 0;
  for (let i = 0; i < frame.length - 1; i++) sum = (sum + frame[i]) & 0xff;
  return (0x55 - sum - EM06.reportId) & 0xff;
}

function frame(command) {
  const out = new Uint8Array(EM06.frameSize);
  out[0] = command;
  out[EM06.frameSize - 1] = EM06.initialTail;
  return out;
}

export function em06Command(command, payload = []) {
  const out = frame(command);
  out[4] = payload.length;
  out.set(payload, 5);
  out[15] = em06Checksum(out);
  return out;
}

export function em06SelectProfile(profile) {
  return em06Command(EM06.commands.setCurrentProfile, [normalizeProfile(profile)]);
}

export function em06GetCurrentProfile() {
  return em06Command(EM06.commands.getCurrentProfile);
}

export function em06IdentifyPayload(bytes = Uint8Array.from([0x31, 0x73, 0xa5, 0xc7])) {
  if (bytes.length !== 4) throw new RangeError('identification payload must be 4 bytes');
  return em06Command(EM06.commands.encryptionData, bytes);
}

export function em06ReadFlash(address, length) {
  if (!Number.isInteger(address) || address < 0 || address > 0xffff) throw new RangeError('address must fit uint16');
  if (!Number.isInteger(length) || length < 0 || length > 10) throw new RangeError('read length must be 0..10');
  const out = frame(EM06.commands.readFlash);
  out[2] = (address >>> 8) & 0xff;
  out[3] = address & 0xff;
  out[4] = length;
  out[15] = em06Checksum(out);
  return out;
}

export function em06WriteFlash(address, bytes) {
  if (!Number.isInteger(address) || address < 0 || address > 0xffff) throw new RangeError('address must fit uint16');
  if (bytes.length > 10) throw new RangeError('write payload must be 0..10 bytes');
  const out = frame(0x07);
  out[2] = (address >>> 8) & 0xff;
  out[3] = address & 0xff;
  out[4] = bytes.length;
  out.set(bytes, 5);
  out[15] = em06Checksum(out);
  return out;
}

export function em06FlashChecksum(bytes) {
  let sum = 0;
  for (const byte of bytes.slice(0, -1)) sum = (sum + byte) & 0xff;
  return (0x55 - sum) & 0xff;
}

export function em06KeyRecord(type, param) {
  if (!Number.isInteger(type) || type < 0 || type > 0xff) throw new RangeError('key type must fit uint8');
  if (!Number.isInteger(param) || param < 0 || param > 0xffff) throw new RangeError('key parameter must fit uint16');
  const record = Uint8Array.from([type, param >>> 8, param & 0xff, 0]);
  record[3] = em06FlashChecksum(record);
  return record;
}

export function em06ProfileCycleKey(profile = 0) {
  return em06KeyRecord(EM06.keyFunction.profileSwitch, (normalizeProfile(profile) + 1) % PROFILE_COUNT);
}

export function em06ShortcutRecord(keys) {
  if (!Array.isArray(keys) || keys.length > 5) throw new RangeError('shortcut must contain 0..5 HID keys');
  const record = [keys.length * 2];
  for (const key of keys) record.push((key.type | 0x80) & 0xff, key.value & 0xff, (key.value >>> 8) & 0xff);
  for (const key of [...keys].reverse()) record.push((key.type | 0x40) & 0xff, key.value & 0xff, (key.value >>> 8) & 0xff);
  record.push(0);
  record[record.length - 1] = em06FlashChecksum(Uint8Array.from(record));
  return Uint8Array.from(record);
}

export function em06DecodeShortcutRecord(bytes) {
  const data = Uint8Array.from(bytes ?? []);
  if (data.every((byte) => byte === 0)) return [];
  if (data.length < 2 || data[0] % 2 !== 0) throw new RangeError('invalid EM06 shortcut record');
  const count = data[0] / 2;
  if (count > 5 || data.length < count * 6 + 2) throw new RangeError('invalid EM06 shortcut length');
  const keys = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 1 + index * 3;
    keys.push({ type: data[offset] & 0x7f, value: data[offset + 1] | (data[offset + 2] << 8) });
  }
  const checksumOffset = count * 6 + 1;
  if (data[checksumOffset] !== em06FlashChecksum(data.slice(0, checksumOffset + 1))) {
    throw new Error('invalid EM06 shortcut checksum');
  }
  return keys;
}

export function em06MacroNameRecord(name = '') {
  const encoded = new TextEncoder().encode(String(name)).slice(0, 30);
  const record = new Uint8Array(31);
  record[0] = encoded.length;
  record.set(encoded, 1);
  return record;
}

function em06WriteFlashChunks(address, bytes) {
  const reports = [];
  for (let offset = 0; offset < bytes.length; offset += 10) {
    reports.push(em06WriteFlash(address + offset, bytes.slice(offset, offset + 10)));
  }
  return reports;
}

export function em06DecodeMacroName(bytes) {
  const data = Uint8Array.from(bytes ?? []);
  const length = Math.min(data[0] ?? 0, 30, Math.max(0, data.length - 1));
  return new TextDecoder().decode(data.slice(1, 1 + length));
}

export class Em06MouseCodec {
  decodeState(reports) {
    return { reports: reports.map((r) => Uint8Array.from(r)) };
  }
  encodeProfile(profile, keymap) {
    normalizeProfile(profile);
    if (!keymap || !Array.isArray(keymap.keys)) throw new TypeError('keymap.keys is required');
    const reports = [];
    reports.push(em06SelectProfile(profile));
    keymap.keys.forEach((key, index) => {
      const slot = Number.isInteger(key.slot) ? key.slot : index;
      if (slot < 0 || slot >= 16) throw new RangeError('EM06 mouse key table has 16 slots');
      reports.push(em06WriteFlash(EM06.mouseFlash.keys + slot * 4, em06KeyRecord(key.type, key.param)));
    });
    if (keymap.shortcuts) keymap.shortcuts.forEach((entry, index) => {
      const slot = Number.isInteger(entry?.slot) ? entry.slot : index;
      const keys = Array.isArray(entry) ? entry : entry?.keys;
      if (slot < 0 || slot >= 16) throw new RangeError('EM06 mouse has 16 shortcut slots');
      reports.push(...em06WriteFlashChunks(EM06.mouseFlash.shortcut + slot * 32, em06ShortcutRecord(keys ?? [])));
    });
    return reports;
  }
  encodeFlashImage(image) {
    if (!(image instanceof Uint8Array)) throw new TypeError('image must be a Uint8Array');
    const reports = [];
    for (let address = 0; address < image.length; address += 10) {
      reports.push(em06WriteFlash(address, image.slice(address, address + 10)));
    }
    return reports;
  }
  encodeProfileSelect(profile) { return [em06SelectProfile(profile)]; }
}

export class MockTransport {
  constructor() { this.connected = false; this.writes = []; }
  async connect() { this.connected = true; }
  async disconnect() { this.connected = false; }
  async readFeatureReports() { if (!this.connected) throw new Error('not connected'); return []; }
  async writeFeatureReports(reports) {
    if (!this.connected) throw new Error('not connected');
    this.writes.push(structuredClone(reports));
  }
}
