// Browser-only fake transport: no real HID device is requested or written.
async (page) => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  await page.reload();
  await page.evaluate(async () => {
    const { WebHidTransport } = await import(new URL('../src/webhid.js', location.href).href);
    const test = {
      active: 2, selections: [], writes: 0, hold: false, fail: false, release: null,
    };
    // Resolve relative to the current app so this also runs under GitHub Pages.
    const transport = {
      device: { productName: 'EM06 test device' },
      async connect() {}, async disconnect() {},
      async writeFeatureReports(frames) { for (const f of frames) await this.send(f); },
      async send(frame) {
        const reply = new Uint8Array(16); reply.set(frame);
        if (frame[0] === 14) reply[5] = test.active;
        if (frame[0] === 15) {
          test.selections.push(frame[5]);
          if (test.hold) await new Promise(resolve => { test.release = resolve; });
          if (test.fail) throw new Error('Test switch failure');
          test.active = frame[5];
        }
        if (frame[0] === 8) reply.fill(0, 5, 5 + frame[4]);
        if (frame[0] === 7) test.writes++;
        if (frame[0] === 18) { reply[5] = 4; reply[6] = 16; }
        return reply;
      },
    };
    WebHidTransport.request = async () => transport;
    globalThis.__profileSwitchQA = test;
  });
  const buttons = page.locator('#profileSwitches button');
  check(await buttons.count() === 4, 'Expected four direct hardware switches');
  check(await buttons.evaluateAll(nodes => nodes.every(n => n.disabled)), 'Disconnected switches must be disabled');
  await page.locator('#connect').click();
  await page.getByText('v4.10', { exact: true }).waitFor();
  const active = () => page.locator('#profileSwitches [aria-pressed="true"]').textContent();
  check(await active() === '3', 'Initial hardware profile not highlighted');
  check(await page.locator('#profileTitle').textContent() === 'Profile 3', 'Connect did not open the active profile for editing');
  await page.evaluate(() => { globalThis.__profileSwitchQA.selections = []; });
  await page.locator('#profileTabs button').nth(0).click();
  await page.getByLabel('Button 7 function', { exact: true }).selectOption('9');
  check(await active() === '3', 'Editing a draft changed the hardware selection');
  await page.evaluate(() => { globalThis.__profileSwitchQA.hold = true; });
  await page.getByRole('button', { name: 'Switch to Profile 1', exact: true }).click();
  await page.waitForFunction(() => globalThis.__profileSwitchQA.release !== null);
  check(await buttons.evaluateAll(nodes => nodes.every(n => n.disabled)), 'Switch controls remain enabled while busy');
  check(await active() === '3', 'Hardware highlight changed before switch completed');
  await page.evaluate(() => { const t = globalThis.__profileSwitchQA; t.hold = false; t.release(); });
  await page.getByText('Profile 1 is now active', { exact: true }).waitFor();
  check(await active() === '1', 'One click did not activate Profile 1');
  check(await page.getByLabel('Button 7 function', { exact: true }).inputValue() === '9', 'Switching discarded the dirty draft');
  check(await page.locator('#profileTabs button').nth(0).getAttribute('class').then(c => c.includes('dirty')), 'Dirty state lost');
  await page.evaluate(() => { globalThis.__profileSwitchQA.fail = true; });
  await page.getByRole('button', { name: 'Switch to Profile 4', exact: true }).click();
  await page.getByText('Profile switch failed · Test switch failure', { exact: true }).waitFor();
  check(await active() === '1', 'Failed switch changed the active highlight');
  check(await page.getByRole('button', { name: 'Switch to Profile 4', exact: true }).isEnabled(), 'Failed switch left controls locked');
  await page.evaluate(() => { globalThis.__profileSwitchQA.fail = false; });
  await page.getByRole('button', { name: 'Switch to Profile 4', exact: true }).click();
  await page.getByText('Profile 4 is now active', { exact: true }).waitFor();
  check(await active() === '4', 'Direct jump to Profile 4 failed');
  check(await page.locator('#profileTitle').textContent() === 'Profile 1', 'Hardware activation moved the editor');
  await page.evaluate(() => { globalThis.__profileSwitchQA.active = 1; });
  await page.waitForFunction(() => document.querySelector('#profileSwitches [aria-pressed="true"]')?.textContent === '2');
  check(await page.locator('#profileTitle').textContent() === 'Profile 1', 'External profile change moved the editor');
  await page.locator('#profileTabs button').nth(2).click();
  check(await active() === '2', 'Selecting a clean profile for editing changed the mouse');
  await page.getByRole('button', { name: 'Switch to Profile 1', exact: true }).click();
  await page.getByText('Profile 1 is now active', { exact: true }).waitFor();
  check(await page.locator('#profileTitle').textContent() === 'Profile 3', 'Hardware activation moved a clean editor');
  const result = await page.evaluate(() => ({ writes: globalThis.__profileSwitchQA.writes, selections: globalThis.__profileSwitchQA.selections }));
  check(result.writes === 0, 'Activation wrote configuration data');
  check(JSON.stringify(result.selections) === '[0,3,3,0]', 'Unexpected/repeated activation commands');
  await page.screenshot({ path: 'output/playwright/direct-profile-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 700, height: 1000 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'Narrow overflow');
  await page.screenshot({ path: 'output/playwright/direct-profile-narrow.png', fullPage: true });
  await page.locator('#connect').click();
  check(await buttons.evaluateAll(nodes => nodes.every(n => n.disabled)), 'Disconnect left switch controls enabled');
  check(await page.locator('#profileSwitches [aria-pressed="true"]').count() === 0, 'Disconnect left a stale active highlight');
  await page.reload();
  return 'Direct-profile regression passed';
}
