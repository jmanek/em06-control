// Run via playwright-cli run-code --filename scripts/profile-action-qa.js.
// Imports local drafts; never connects to or writes a real device.
async (page) => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const params = [0, 1, 3, 256];
  const setup = {
    format: 'em06-hub-setup', version: 3,
    profiles: params.map(param => ({
      keys: Array.from({ length: 8 }, () => ({ type: 9, param })),
      shortcuts: Array(8).fill(null), macros: {},
    })),
  };
  await page.locator('#importFile').setInputFiles({
    name: 'profile-action-regression.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(setup)),
  });
  await page.getByText('Setup imported as local drafts', { exact: true }).waitFor();
  const inspect = async (button) => {
    const editor = page.locator('#selectedEditor');
    check(await editor.locator('select').count() === 1, 'Profile action still offers a target selector');
    check(await editor.locator('input').count() === 0, 'Profile action exposes a raw parameter');
    check(await page.getByLabel(`Button ${button} function`, { exact: true }).inputValue() === '9', 'Wrong selected action');
    check(await editor.locator('option:checked').textContent() === 'Next profile', 'Wrong function label');
    check(await page.locator('#selectedSummary').textContent() === 'Current action: Next profile', 'Summary implies a target');
    check((await editor.textContent()).includes('1 → 2 → 3 → 4 → 1'), 'Missing cycle order');
    check((await page.getByLabel(`Button ${button} function`, { exact: true }).getAttribute('title')).includes('LED blinks'), 'Missing LED tooltip');
  };
  for (let i = 0; i < 4; i++) {
    await page.locator('#profileTabs button').nth(i).click();
    await page.locator('.hotspot[data-key="6"]').click();
    await inspect(7);
    check(await page.locator('.hotspot[data-key="6"] .hotspot-value').textContent() === 'Next profile', 'Hotspot implies a target');
    await page.locator('#sideDpi').click();
    await inspect(8);
    check(await page.locator('#sideDpiValue').textContent() === 'Next profile', 'Side button implies a target');
  }
  const downloadSetup = async () => {
    const event = page.waitForEvent('download');
    await page.locator('#export').click();
    const download = await event;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString());
  };
  const exported = await downloadSetup();
  check(JSON.stringify(exported) === JSON.stringify(setup), 'Viewing existing mappings changed exported data');
  await page.locator('#profileTabs button').nth(0).click();
  await page.locator('.hotspot[data-key="6"]').click();
  await page.getByLabel('Button 7 function', { exact: true }).selectOption('0');
  await page.getByLabel('Button 7 function', { exact: true }).selectOption('9');
  await inspect(7);
  check((await downloadSetup()).profiles[0].keys[6].param === 0, 'New next-profile mapping has unexpected parameter');
  await page.locator('#cycleKey').selectOption('5');
  await page.locator('#setCycleAll').click();
  const cycled = await downloadSetup();
  check(cycled.profiles.every((p, i) => p.keys[5].type === 9 && p.keys[5].param === (i + 1) % 4), 'Cycle helper changed its established wire format');
  check(await page.locator('#profileTarget option').count() === 4, 'Direct sidebar selection lost profiles');
  check((await page.locator('#cycle').getAttribute('title')).includes('LED blinks'), 'Missing direct-switch LED tooltip');
  await page.locator('#sideDpi').click();
  await inspect(8);
  await page.screenshot({ path: 'output/playwright/next-profile-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 700, height: 1000 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'Narrow layout overflows');
  await page.screenshot({ path: 'output/playwright/next-profile-narrow.png', fullPage: true });
  console.log('Profile-action regression passed: existing parameters preserved; editor, hotspot, side button, new assignment, cycle helper, sidebar options, and LED tooltips verified.');
  return 'Profile-action regression passed';
}
