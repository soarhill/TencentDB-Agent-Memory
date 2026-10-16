async (page) => {
  const base = 'http://127.0.0.1:5174/__tab-keyboard';
  const source = await (await page.request.get(`${base}/meta`)).json();
  if (source.mode !== 'baseline') throw new Error('Restart serve.mjs with --baseline');
  const results = [];
  for (const active of ['wiki', 'code']) {
    for (const input of ['Enter', 'Space']) {
      await page.goto(`${base}?lang=en-US&active=${active}`);
      await page.locator('[data-guide="tab-wiki"] button').focus();
      await page.keyboard.press(input);
      const actual = await page.evaluate(() => window.verification.events);
      const remaining = await page.locator('[data-guide="tab-wiki"]').count();
      if (JSON.stringify(actual.navigate) !== '["wiki"]' || actual.close.length !== 0 || actual.clicks.length !== 0 || remaining !== 1 || actual.keys.length !== 1 || actual.keys[0].key !== (input === 'Space' ? ' ' : input) || !actual.keys[0].prevented) {
        throw new Error(`Baseline did not reproduce as expected: ${active}/${input}: ${JSON.stringify(actual)}`);
      }
      results.push({ active, input, actual, targetRemaining: remaining, defectReproduced: true });
    }
  }
  return { source, browser: await page.context().browser().version(), recordedAt: new Date().toISOString(), reproduced: results.length, results };
}
