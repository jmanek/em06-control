import { EM06, em06Checksum } from './em06.js';

export class Em06SimulatorTransport {
  constructor({ profileCount = 4, flashSize = 8192 } = {}) {
    this.profiles = Array.from({ length: profileCount }, () => new Uint8Array(flashSize));
    this.profile = 0;
    this.connected = false;
    this.writes = [];
  }

  async connect() { this.connected = true; }
  async disconnect() { this.connected = false; }

  async send(frame) {
    if (!this.connected) throw new Error('not connected');
    if (frame.length !== 16 || frame[15] !== em06Checksum(frame)) throw new Error('invalid frame checksum');
    this.writes.push(Uint8Array.from(frame));
    const response = new Uint8Array(frame);
    if (frame[0] === EM06.commands.setCurrentProfile) {
      this.profile = frame[5];
    } else if (frame[0] === EM06.commands.readFlash) {
      response.set(this.profiles[this.profile].slice((frame[2] << 8) | frame[3], ((frame[2] << 8) | frame[3]) + (frame[4] & 15)), 5);
    } else if (frame[0] === 0x07) {
      const address = (frame[2] << 8) | frame[3];
      this.profiles[this.profile].set(frame.slice(5, 5 + (frame[4] & 15)), address);
    }
    return response;
  }

  async writeFeatureReports(reports) { for (const report of reports) await this.send(report); }
  async readFeatureReports() { return []; }
}
