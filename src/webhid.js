import {
  EM06,
  Em06MouseCodec,
  em06ReadFlash,
  em06IdentifyPayload,
  em06GetCurrentProfile,
  em06SelectProfile,
  em06WriteFlash,
  normalizeProfile,
} from './em06.js';

export class WebHidTransport {
  constructor(device, { reportId = EM06.reportId, timeoutMs = 1500 } = {}) {
    this.device = device;
    this.reportId = reportId;
    this.timeoutMs = timeoutMs;
    this.pending = [];
    this.onInput = (event) => {
      if (event.reportId !== this.reportId) return;
      const data = new Uint8Array(event.data.buffer.slice(0));
      const index = this.pending.findIndex(({ matcher }) => !matcher || matcher(data));
      if (index >= 0) {
        const [{ finish }] = this.pending.splice(index, 1);
        finish(data);
      }
    };
  }

  static async request() {
    if (!globalThis.navigator?.hid) throw new Error('WebHID is unavailable; use Chrome or Edge');
    const protoArc = (device) => device.vendorId === 0x260d;
    let devices = (await navigator.hid.getDevices()).filter(protoArc);
    if (devices.length === 0) devices = await navigator.hid.requestDevice({ filters: [{ vendorId: 0x260d }] });
    const device = devices.find(protoArc);
    if (!device) throw new Error('No ProtoArc device was selected in the HID chooser');
    if (device.productId !== 0x1326 && !/em06/i.test(device.productName || '')) {
      throw new Error(`Selected ProtoArc device is not recognized as an EM06 (${device.productName || `PID 0x${device.productId.toString(16)}`})`);
    }
    return new WebHidTransport(device);
  }

  async connect() {
    if (!this.device.opened) await this.device.open();
    this.device.addEventListener('inputreport', this.onInput);
  }

  async disconnect() {
    this.device.removeEventListener('inputreport', this.onInput);
    if (this.device.opened) await this.device.close();
  }

  async send(frame, { waitForResponse = true, matcher = (data) => data[0] === frame[0] } = {}) {
    let pending;
    const response = waitForResponse ? new Promise((resolve, reject) => {
      pending = { finish: null, matcher };
      const timer = setTimeout(() => {
        this.pending = this.pending.filter((wait) => wait !== pending);
        reject(new Error('EM06 HID response timeout'));
      }, this.timeoutMs);
      pending.finish = (data) => { clearTimeout(timer); resolve(data); };
      this.pending.push(pending);
    }) : null;
    try { await this.device.sendReport(this.reportId, frame); }
    catch (error) { this.pending = this.pending.filter((wait) => wait !== pending); throw error; }
    return response;
  }

  async writeFeatureReports(reports) {
    for (const report of reports) await this.send(report);
  }

  async readFeatureReports() { return []; }
}

export class Em06Mouse {
  constructor(transport, codec = new Em06MouseCodec()) {
    this.transport = transport;
    this.codec = codec;
    this.profile = 0;
  }

  async connect() { await this.transport.connect(); }
  async disconnect() { await this.transport.disconnect(); }

  async identify() {
    const response = await this.transport.send(em06IdentifyPayload());
    if (!response || response[0] !== EM06.commands.encryptionData) throw new Error('unexpected EM06 identification response');
    return { cid: response[9], mid: response[10], type: response[11] };
  }

  async selectProfile(profile) {
    normalizeProfile(profile);
    await this.transport.writeFeatureReports([em06SelectProfile(profile)]);
    this.profile = profile;
  }

  async currentProfile() {
    const response = await this.transport.send(em06GetCurrentProfile(), {
      matcher: (data) => data[0] === EM06.commands.getCurrentProfile,
    });
    if (!response || response[0] !== EM06.commands.getCurrentProfile) throw new Error('unexpected EM06 current-profile response');
    this.profile = normalizeProfile(response[5]);
    return this.profile;
  }

  async cycleProfile() { await this.selectProfile((this.profile + 1) % 4); return this.profile; }

  async writeKeymap(profile, keymap) {
    const reports = this.codec.encodeProfile(profile, keymap);
    await this.transport.writeFeatureReports(reports);
    this.profile = profile;
  }

  async readFlash(address, length) {
    if (!Number.isInteger(length) || length < 0) throw new RangeError('length must be a non-negative integer');
    const result = new Uint8Array(length);
    for (let offset = 0; offset < length; offset += 10) {
      const chunk = Math.min(10, length - offset);
      const request = em06ReadFlash(address + offset, chunk);
      let response;
      let lastError;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await this.transport.send(request, {
            matcher: (data) => data[0] === EM06.commands.readFlash
              && data[2] === request[2] && data[3] === request[3]
              && (data[4] & 0x0f) === chunk,
          });
          break;
        } catch (error) { lastError = error; }
      }
      if (!response) throw lastError || new Error('EM06 flash read failed');
      if (!response || response[0] !== EM06.commands.readFlash) throw new Error('unexpected EM06 flash response');
      result.set(response.slice(5, 5 + chunk), offset);
    }
    return result;
  }

  async writeFlash(address, bytes) {
    await this.transport.writeFeatureReports([em06WriteFlash(address, bytes)]);
  }
}
