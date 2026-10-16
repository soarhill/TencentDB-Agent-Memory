import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const webRoot = resolve(process.argv[2] || '.');
const evidenceRoot = dirname(fileURLToPath(import.meta.url));
process.chdir(webRoot);
const baseline = process.argv.includes('--baseline');
const baseSha = 'e9a82935b52741e0c798c75326e90b7144eb4d5f';
const webRequire = createRequire(join(webRoot, 'package.json'));
const { createServer, normalizePath } = await import(pathToFileURL(webRequire.resolve('vite')).href);
const harnessPath = normalizePath(join(evidenceRoot, 'harness.tsx'));
const tabPath = normalizePath(join(webRoot, 'src/layouts/TabBar/index.tsx'));
const git = (...args) => execFileSync('git', args, { cwd: webRoot, encoding: 'utf8' }).trim();
const metadata = {
  mode: baseline ? 'baseline' : 'fixed',
  baseSha,
  sourceHead: git('rev-parse', 'HEAD'),
  workingTree: git('status', '--porcelain'),
  tabBarSource: baseline ? baseSha : 'working-tree',
  node: process.version,
  vite: webRequire('vite/package.json').version,
};
const baselineSource = baseline
  ? git('show', `${baseSha}:MemoryPanel/web/src/layouts/TabBar/index.tsx`)
  : null;

const server = await createServer({
  root: webRoot,
  configFile: join(webRoot, 'vite.config.ts'),
  server: { host: '127.0.0.1', port: 5174, strictPort: true, fs: { allow: [webRoot, evidenceRoot] } },
  plugins: [{
    name: 'tab-keyboard-verification-only',
    enforce: 'pre',
    resolveId(source, importer) {
      // The harness lives outside the product checkout and reuses its dependencies.
      if (importer?.split('?')[0] === harnessPath && !source.startsWith('.') && !source.startsWith('/')) {
        return this.resolve(source, join(webRoot, '__verification_entry.tsx'), { skipSelf: true });
      }
    },
    load(id) {
      if (baselineSource && normalizePath(id.split('?')[0]) === tabPath) return baselineSource;
    },
    configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        const pathname = request.url?.split('?')[0];
        if (pathname === '/__tab-keyboard/meta') {
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify(metadata));
        } else if (pathname === '/api/v1/meta/instances') {
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ code: 0, data: { instances: [], capabilities: { analyticsEnabled: false } } }));
        } else if (pathname === '/__tab-keyboard') {
          try {
            const html = await vite.transformIndexHtml('/__tab-keyboard', `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Tab keyboard regression verification</title></head><body><div id="root"></div><script type="module" src="/@fs/${harnessPath}"></script></body></html>`);
            response.setHeader('Content-Type', 'text/html');
            response.end(html);
          } catch (error) { next(error); }
        } else next();
      });
    },
  }],
});
await server.listen();
console.log(`Verification server: http://127.0.0.1:5174/__tab-keyboard (${metadata.mode})`);
console.log(JSON.stringify(metadata));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => { await server.close(); process.exit(0); });
}
