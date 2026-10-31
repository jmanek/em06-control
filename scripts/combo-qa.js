// Real browser checks with local drafts; never opens a HID connection.
async (page) => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  await page.reload();
  const setup = { format: 'em06-hub-setup', version: 3, profiles: Array.from({ length: 4 }, () => ({
    keys: Array.from({ length: 8 }, () => ({ type: 5, param: 0 })),
    shortcuts: Array.from({ length: 8 }, () => [{ type: 0, value: 1 }, { type: 1, value: 6 }]), macros: {},
  })) };
  setup.profiles[2].shortcuts[6] = [{ type: 1, value: 4 }, { type: 1, value: 4 }];
  setup.profiles[3].shortcuts[6] = [{ type: 1, value: 255 }, { type: 0, value: 3 }];
  await page.locator('#importFile').setInputFiles({ name: 'combo-test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(setup)) });
  await page.getByText('Setup imported as local drafts', { exact: true }).waitFor();
  await page.locator('.hotspot[data-key="6"]').click();
  const field = () => page.getByLabel('Button 7 key or shortcut', { exact: true });
  const exported = async () => {
    const promise = page.waitForEvent('download'); await page.locator('#export').click();
    const stream = await (await promise).createReadStream(); const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString());
  };
  const keys = async () => (await exported()).profiles[0].shortcuts[6];
  check(await field().inputValue() === 'Ctrl+C', 'Existing combination not decoded into names');
  check(!await page.locator('.combo-advanced').getAttribute('open'), 'Advanced HID should start collapsed');
  check(JSON.stringify(await exported()) === JSON.stringify(setup), 'Viewing combo changed stored data');
  for (const profile of [2, 3]) {
    await page.locator('#profileTabs button').nth(profile).click();
    check(await field().inputValue() === '', 'Unusual raw records were simplified into editable names');
    check(JSON.stringify(await exported()) === JSON.stringify(setup), 'Viewing raw records changed data');
  }
  await page.locator('#profileTabs button').nth(0).click();
  check(await field().getAttribute('list') === null, 'Native all-key dropdown is still attached');
  await page.locator('.key-browser summary').click();
  check(await page.locator('.key-grid button').count() === 24, 'Browse should open to F1–F24');
  check(!await page.locator('.key-search-empty').isVisible(), 'No-results message shown despite matching keys');
  await page.getByRole('button', { name: 'Use F20', exact: true }).click();
  check(await field().inputValue() === 'F20', 'Picking F20 did not fill the named field');
  check(JSON.stringify(await keys()) === JSON.stringify(setup.profiles[0].shortcuts[6]), 'Browsing a key changed the saved combo before applying');
  await page.locator('.key-browser summary').click();
  await page.getByLabel('Find a keyboard key', { exact: true }).fill('left_arrow');
  check(await page.locator('.key-grid button').count() === 1, 'Key search does not understand aliases');
  await page.getByRole('button', { name: 'Use ArrowLeft', exact: true }).click();
  await page.locator('.key-browser summary').click();
  await page.getByRole('button', { name: 'Numpad', exact: true }).click();
  check(await page.locator('.key-grid button').count() === 18, 'Numpad group lost keys');
  await page.getByLabel('Find a keyboard key', { exact: true }).fill('not_a_real_key');
  check(await page.locator('.key-grid button').count() === 0, 'Unknown search should not show unrelated results');
  check(await page.locator('.key-search-empty').isVisible(), 'Missing no-results feedback');
  await page.getByRole('button', { name: 'Function', exact: true }).click();
  await page.getByRole('button', { name: 'Use F20', exact: true }).click();
  await field().fill('f20'); await field().press('Enter');
  check(JSON.stringify(await keys()) === '[{"type":1,"value":111}]', 'F20 not saved as HID 0x6F');
  check((await page.locator('#selectedSummary').textContent()).includes('F20'), 'F20 label missing');
  await field().fill('Cmd+Shift+F20'); await page.getByRole('button', { name: 'Set keys', exact: true }).click();
  check((await keys()).length === 3, 'Named combo was not applied');
  await page.getByRole('button', { name: 'Remove Shift from combo', exact: true }).click();
  check(await field().inputValue() === 'Meta+F20', 'Removing one modifier damaged combo');
  await field().fill('F20junk'); await field().press('Enter');
  check(await page.getByRole('alert').isVisible(), 'Invalid name has no error');
  check((await keys()).length === 2, 'Invalid name overwrote draft');
  await page.locator('.combo-advanced summary').click();
  const raw = () => page.getByRole('textbox', { name: 'Button 7 HID usage', exact: true });
  await raw().fill('111junk'); await page.getByRole('button', { name: 'Add HID key', exact: true }).click();
  check((await keys()).length === 2, 'Partial numeric input was accepted');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await raw().fill('0x6F'); await page.getByRole('button', { name: 'Add HID key', exact: true }).click();
  check(JSON.stringify(await keys()) === '[{"type":1,"value":111}]', 'Raw F20 not equivalent to named F20');
  await page.getByLabel('Button 7 shortcut preset', { exact: true }).selectOption('COPY');
  check(await field().inputValue() === 'Ctrl+C', 'Copy preset failed');
  await page.getByRole('button', { name: 'Record keys', exact: true }).click();
  check(await field().isDisabled(), 'Named editing should be disabled while recording');
  await page.keyboard.down('Control');
  // Playwright's keyboard API stops at F12; dispatch the standard DOM code
  // to exercise the same recorder path for a key absent from this keyboard.
  await page.locator('body').dispatchEvent('keydown', { code: 'F20', key: 'F20', bubbles: true });
  await page.keyboard.up('Control');
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  check(JSON.stringify(await keys()) === '[{"type":0,"value":1},{"type":1,"value":111}]', 'Recorded F20 differs from named F20');
  await page.clock.install();
  await page.getByRole('button', { name: 'Record keys', exact: true }).click();
  await page.locator('body').dispatchEvent('keydown', { code: 'F20', key: 'F20', bubbles: true });
  await page.clock.fastForward(4000);
  await page.locator('body').dispatchEvent('keydown', { code: 'F20', key: 'F20', bubbles: true });
  await page.clock.fastForward(2000);
  check(await page.getByRole('button', { name: 'Stop recording', exact: true }).count() === 1, 'Repeated key activity did not renew idle timer');
  await page.clock.fastForward(4000);
  check(await page.getByRole('button', { name: 'Record keys', exact: true }).count() === 1, 'Idle timeout did not stop recording');
  await page.getByRole('button', { name: 'Record keys', exact: true }).click();
  for (let i = 0; i < 7; i++) {
    await page.clock.fastForward(4000);
    await page.locator('body').dispatchEvent('keydown', { code: 'F20', key: 'F20', bubbles: true });
  }
  await page.clock.fastForward(2100);
  check(await page.getByRole('button', { name: 'Record keys', exact: true }).count() === 1, 'Key activity extended the 30-second cap');
  await page.getByRole('button', { name: 'Record keys', exact: true }).click();
  await page.locator('body').dispatchEvent('keydown', { code: 'F19', key: 'F19', bubbles: true });
  await page.locator('#profileTabs button').nth(1).click();
  check(await page.getByRole('button', { name: 'Record keys', exact: true }).count() === 1, 'Context change did not stop recording');
  await page.locator('#profileTabs button').nth(0).click();
  await field().fill('Ctrl+Shift+Alt+Meta+F20+A'); await field().press('Enter');
  check((await page.getByRole('alert').textContent()).includes('five keys'), 'Combo limit not enforced');
  await page.clock.resume();
  await field().fill('F20'); await field().press('Enter');
  await page.locator('.combo-advanced').evaluate(node => { node.open = false; });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'output/playwright/combo-desktop.png', fullPage: true });
  await page.locator('.key-browser summary').click();
  await page.screenshot({ path: 'output/playwright/key-browser-desktop.png', fullPage: true });
  await page.locator('.key-browser summary').click();
  await page.locator('.combo-advanced summary').click();
  await page.screenshot({ path: 'output/playwright/combo-advanced.png', fullPage: true });
  await page.locator('.combo-advanced summary').click();
  await page.setViewportSize({ width: 700, height: 1000 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'Combo causes narrow overflow');
  const editor = await page.locator('.combo-editor').boundingBox();
  const input = await field().boundingBox();
  check(input.x >= editor.x && input.x + input.width <= editor.x + editor.width + 1, 'Named input extends outside editor');
  const inspector = await page.locator('.inspector').boundingBox();
  const sideButton = await page.locator('#sideDpi').boundingBox();
  check(sideButton.x + sideButton.width <= inspector.x + inspector.width - 8, 'Side control extends outside inspector');
  await page.screenshot({ path: 'output/playwright/combo-narrow.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'Combo causes phone-width overflow');
  await page.locator('.key-browser summary').click();
  check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'Key browser causes phone-width overflow');
  await page.locator('.inspector').screenshot({ path: 'output/playwright/combo-phone.png' });
  return 'Combo regression passed';
}
