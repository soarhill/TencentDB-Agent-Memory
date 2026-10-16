import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider, useLocation, useNavigate } from 'react-router-dom';
import { TabBar } from '/src/layouts/TabBar';
import { ConsoleLayout } from '/src/layouts/ConsoleLayout';
import i18n, { changeLanguage } from '/src/i18n';
import { useBackendStore } from '/src/stores/backend';
import type { PageId } from '/src/constants/menu';
import 'tea-component/dist/themes/default-pack.css';
import 'tea-component/dist/tea-themeable.css';
import '/src/index.css';
import '/src/tea-override.css';

// Avoid unrelated auth/team requests; capability data is served by serve.mjs.
useBackendStore.setState({ teamsLoaded: true, teams: [] });
const params = new URLSearchParams(location.search);
await i18n.changeLanguage(params.get('lang') || 'en-US');
const events = { navigate: [] as string[], close: [] as string[], routes: [] as string[], clicks: [] as string[], keys: [] as { key: string; prevented: boolean }[] };
Object.assign(window, { verification: { events, changeLanguage } });
document.addEventListener('click', event => {
  const button = (event.target as Element).closest('button._memory-tabbar-close');
  if (button) events.clicks.push(button.closest('[data-guide]')!.getAttribute('data-guide')!);
}, true);
document.addEventListener('keydown', event => {
  // Document bubble runs after React's root listener, observing final defaultPrevented.
  if ((event.target as Element).closest('._memory-tabbar')) events.keys.push({ key: event.key, prevented: event.defaultPrevented });
});

function ComponentCheck() {
  const [pages, setPages] = useState<PageId[]>(['workbench_board', 'wiki', 'code']);
  const [activePage, setActivePage] = useState<PageId>(params.get('active') === 'wiki' ? 'wiki' : 'code');
  return <TabBar pages={pages} activePage={activePage} onNavigate={id => {
    events.navigate.push(id);
    setActivePage(id);
  }} onClose={id => {
    events.close.push(id);
    setPages(previous => previous.filter(page => page !== id));
  }} />;
}

function OutletControls() {
  const current = useLocation();
  const navigate = useNavigate();
  return <div><output data-testid="route">{current.pathname}</output><button onClick={() => navigate('/wiki')}>Open Wiki</button><button onClick={() => navigate('/code')}>Open Code</button></div>;
}

if (params.get('mode') === 'layout') {
  // ConsoleLayout owns the production openPages/closePage implementation.
  // Only outlet contents are replaced; this is memory-router integration, not backend E2E.
  const router = createMemoryRouter([{ element: <ConsoleLayout />, children: [{ path: '*', element: <OutletControls /> }] }], { initialEntries: ['/'] });
  let lastKey = router.state.location.key;
  events.routes.push(router.state.location.pathname);
  router.subscribe(state => {
    if (state.location.key !== lastKey) {
      lastKey = state.location.key;
      events.routes.push(state.location.pathname);
    }
  });
  createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />);
} else {
  createRoot(document.getElementById('root')!).render(<ComponentCheck />);
}
