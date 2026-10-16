async (page) => {
  const startedAt = new Date().toISOString();
  const results = [];
  const pageErrors = [], failedRequests = [], httpErrors = [];
  const messages = new Map();
  const onError = error => pageErrors.push(String(error));
  const onRequest = request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText });
  const onResponse = response => { if (response.status() >= 400) httpErrors.push({ url: response.url(), status: response.status() }); };
  const onConsole = message => {
    if (!['error', 'warning'].includes(message.type())) return;
    // Preserve message text without machine-specific stack paths; count every occurrence.
    const text = message.text().split('\n')[0];
    const id = `${message.type()}:${text}`;
    const old = messages.get(id);
    messages.set(id, { type: message.type(), text, count: (old?.count || 0) + 1 });
  };
  page.on('pageerror', onError);
  page.on('requestfailed', onRequest);
  page.on('response', onResponse);
  page.on('console', onConsole);
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const base = 'http://127.0.0.1:5174/__tab-keyboard';
  page.setDefaultTimeout(10000);
  const tab = id => page.locator(`[data-guide="tab-${id}"]`);
  const close = () => tab('wiki').getByRole('button');
  const events = () => page.evaluate(() => window.verification.events);
  const labels = { 'en-US': ['Wiki Knowledge Base', 'Close Wiki Knowledge Base'], 'zh-CN': ['Wiki 知识库', '关闭Wiki 知识库'] };
  const action = async (control, input) => {
    if (input === 'mouse') await control.click();
    else { await control.focus(); await page.keyboard.press(input); }
  };
  const assertKey = (actual, input, prevented = false) => {
    if (input === 'mouse') assert(actual.keys.length === 0, 'mouse must not synthesize keydown');
    else {
      assert(actual.keys.length === 1, `exactly one keydown required, got ${actual.keys.length}`);
      assert(actual.keys[0].key === (input === 'Space' ? ' ' : input), 'expected key captured');
      assert(actual.keys[0].prevented === prevented, 'unexpected defaultPrevented');
    }
  };
  try {
    const source = await (await page.request.get(`${base}/meta`)).json();
    assert(source.mode === 'fixed', 'run fixed matrix without --baseline');
    for (const lang of ['en-US', 'zh-CN']) {
      for (const active of ['wiki', 'code']) {
        for (const input of ['Enter', 'Space', 'mouse']) {
          await page.goto(`${base}?lang=${lang}&active=${active}`);
          assert(await close().getAttribute('aria-label') === labels[lang][1], 'localized accessible name');
          assert(await tab('wiki').locator('._memory-tabbar-label').textContent() === labels[lang][0], 'visible label');
          assert(await tab('wiki').getAttribute('aria-selected') === String(active === 'wiki'), 'active fixture');
          assert(await tab('workbench_board').getByRole('button').count() === 0, 'pinned tab has no close button');
          await action(close(), input);
          await tab('wiki').waitFor({ state: 'detached' });
          const actual = await events();
          assert(JSON.stringify(actual.close) === '["wiki"]', 'one close callback');
          assert(JSON.stringify(actual.clicks) === '["tab-wiki"]', 'one native close click');
          assert(actual.navigate.length === 0, 'no parent navigation');
          assertKey(actual, input);
          assert(await page.getByRole('tab').count() === 2 && await tab('code').count() === 1, 'only intended tab removed');
          results.push({ suite: 'component-close', lang, active, input, actual, pass: true });
        }
      }
      for (const input of ['Enter', 'Space']) {
        await page.goto(`${base}?lang=${lang}&active=code`);
        await action(tab('wiki'), input);
        const actual = await events();
        assert(JSON.stringify(actual.navigate) === '["wiki"]' && actual.close.length === 0, 'container activation once');
        await page.waitForFunction(() => document.querySelector('[data-guide="tab-wiki"]')?.getAttribute('aria-selected') === 'true', null, { timeout: 10000 });
        assert(await tab('wiki').getAttribute('aria-selected') === 'true', 'target selected');
        assertKey(actual, input, true);
        results.push({ suite: 'container', lang, input, actual, pass: true });
      }
    }

    await page.goto(`${base}?lang=en-US&active=code`);
    const identity = await page.evaluate(() => {
      window.verification.originalTab = document.querySelector('[data-guide="tab-wiki"]');
      return performance.timeOrigin;
    });
    const languageResults = [];
    for (const lang of ['zh-CN', 'en-US']) {
      // Use the application's exported language API; this does not click the header UI.
      await page.evaluate(lang => window.verification.changeLanguage(lang), lang);
      await page.getByRole('button', { name: labels[lang][1], exact: true }).waitFor();
      assert(await tab('wiki').locator('._memory-tabbar-label').textContent() === labels[lang][0], 'live visible label');
      assert(await page.evaluate(() => window.verification.originalTab === document.querySelector('[data-guide="tab-wiki"]')), 'same mounted tab');
      assert(await page.evaluate(() => performance.timeOrigin) === identity, 'no document reload');
      languageResults.push({ lang, label: labels[lang][0], accessibleName: labels[lang][1] });
    }
    const languageEvents = await events();
    assert(languageEvents.navigate.length === 0 && languageEvents.close.length === 0, 'language change does not navigate or close');
    results.push({ suite: 'live-language-change', actual: languageResults, sameTabAndDocument: true, pass: true });

    for (const lang of ['en-US', 'zh-CN']) {
      for (const active of ['wiki', 'code']) {
        for (const input of ['Enter', 'Space', 'mouse']) {
          await page.goto(`${base}?mode=layout&lang=${lang}`);
          await page.getByRole('button', { name: 'Open Wiki', exact: true }).press('Enter');
          await tab('wiki').waitFor();
          await page.waitForFunction(() => document.querySelector('[data-testid="route"]')?.textContent === '/wiki', null, { timeout: 10000 });
          await page.getByRole('button', { name: 'Open Code', exact: true }).press('Enter');
          await tab('code').waitFor();
          if (active === 'wiki') await tab('wiki').click();
          await page.waitForFunction(active => document.querySelector('[data-guide="tab-wiki"]')?.getAttribute('aria-selected') === String(active === 'wiki'), active, { timeout: 10000 });
          const before = await events();
          assert(before.routes.at(-1) === `/${active}`, 'initial route');
          assert(await tab('wiki').getAttribute('aria-selected') === String(active === 'wiki'), 'layout active fixture');
          await action(close(), input);
          await tab('wiki').waitFor({ state: 'detached' });
          await page.waitForFunction(() => document.querySelector('[data-testid="route"]')?.textContent === '/code', null, { timeout: 10000 });
          const actual = await events();
          const addedRoutes = actual.routes.slice(before.routes.length);
          assert(JSON.stringify(addedRoutes) === JSON.stringify(active === 'wiki' ? ['/code'] : []), 'only normal fallback navigation');
          assert(JSON.stringify(actual.clicks) === '["tab-wiki"]', 'one native close click');
          assertKey(actual, input);
          assert(await tab('code').getAttribute('aria-selected') === 'true' && await page.getByRole('tab').count() === 2, 'expected remaining tabs');
          // Component mode measures callback counts. Layout mode measures production state/routing.
          results.push({ suite: 'layout-fallback', lang, active, input, routeBefore: `/${active}`, addedRoutes, actual, pass: true });
        }
      }
    }

    await page.goto(`${base}?lang=en-US&active=code`);
    const order = [tab('workbench_board'), tab('wiki'), close(), tab('code'), tab('code').getByRole('button')];
    const focusOrder = [];
    for (const control of order) {
      await page.keyboard.press('Tab');
      assert(await control.evaluate(element => element === document.activeElement), 'Tab focus order');
      focusOrder.push(await control.evaluate(element => element.matches('[role="tab"]') ? element.getAttribute('data-guide') : `${element.closest('[data-guide]').getAttribute('data-guide')}-close`));
    }
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    assert(await close().evaluate(element => element === document.activeElement), 'Shift+Tab returns to Wiki close');
    // Clear only Tab bookkeeping, retaining all subsequent Space events and callbacks.
    await page.evaluate(() => { window.verification.events.keys.length = 0; });
    await page.keyboard.down('Space');
    const afterDown = await events();
    assert(afterDown.close.length === 0 && afterDown.clicks.length === 0 && afterDown.navigate.length === 0, 'no activation on Space down');
    assertKey(afterDown, 'Space');
    await page.keyboard.up('Space');
    await tab('wiki').waitFor({ state: 'detached' });
    const afterUp = await events();
    assert(JSON.stringify(afterUp.close) === '["wiki"]' && JSON.stringify(afterUp.clicks) === '["tab-wiki"]', 'Space release closes once');
    assert(afterUp.navigate.length === 0, 'no parent activation on Space release');
    assertKey(afterUp, 'Space');
    results.push({ suite: 'tab-order-and-space-release', focusOrder, afterDown, afterUp, pass: true });

    assert(results.length === 30, 'expected matrix size');
    assert(new Set(results.map(result => JSON.stringify([result.suite, result.lang, result.active, result.input]))).size === 30, 'unique scenario identifiers');
    assert(pageErrors.length === 0 && failedRequests.length === 0 && httpErrors.length === 0, 'unexpected browser/network errors; inspect CLI diagnostics');
    return { startedAt, finishedAt: new Date().toISOString(), source, browser: await page.context().browser().version(), passed: results.length, results, pageErrors, failedRequests, httpErrors, consoleMessages: [...messages.values()] };
  } finally {
    page.off('pageerror', onError);
    page.off('requestfailed', onRequest);
    page.off('response', onResponse);
    page.off('console', onConsole);
  }
}
