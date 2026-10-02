#!/usr/bin/env node
/**
 * Builds the deploy package for hosts on Node 18 (Windows/IIS with iisnode, or similar),
 * which can't run the build tools or TypeScript themselves.
 *
 *   node scripts/release.mjs                    builds it into .release/
 *   node scripts/release.mjs --commit           also commits it to the `release` branch
 *   node scripts/release.mjs --commit --push    and pushes that branch to origin
 *
 * The package needs no `npm install`: the API is bundled into one file (server/index.js) with
 * its dependencies inlined, and SQLite comes from sql.js (WebAssembly) in server/vendor.
 * It also holds the built site (dist/), plus app.cjs (the startup file) and web.config for IIS from deploy/.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'vite'

const root = resolve(import.meta.dirname, '..')
const out = join(root, '.release')
const commit = process.argv.includes('--commit')
const push = process.argv.includes('--push')

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts })
const git = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

if (commit && git(['status', '--porcelain'])) {
  console.error('Commit or stash your changes first, so the release matches a commit on this branch.')
  process.exit(1)
}

// Build the site.
run('npm', ['run', 'build'])

// Bundle the API into one ES module for Node 18, with hono and @hono/node-server inlined,
// so the host resolves no packages at runtime. Only Node built-ins stay external.
rmSync(join(root, 'build', 'bundle'), { recursive: true, force: true })
await build({
  root,
  configFile: false,
  logLevel: 'warn',
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: 'server/index.ts',
    outDir: 'build/bundle',
    target: 'node18',
    minify: false,
    rollupOptions: { output: { format: 'esm', entryFileNames: 'index.js' } },
  },
})

// Assemble the package.
rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'server', 'vendor'), { recursive: true })
cpSync(join(root, 'dist'), join(out, 'dist'), { recursive: true })
cpSync(join(root, 'build', 'bundle', 'index.js'), join(out, 'server', 'index.js'))
// sql-wasm.js is CommonJS; .cjs keeps Node from reading it as ESM under "type": "module".
const sqlJsDist = join(root, 'node_modules', 'sql.js', 'dist')
cpSync(join(sqlJsDist, 'sql-wasm.js'), join(out, 'server', 'vendor', 'sql-wasm.cjs'))
cpSync(join(sqlJsDist, 'sql-wasm.wasm'), join(out, 'server', 'vendor', 'sql-wasm.wasm'))
cpSync(join(sqlJsDist, '..', 'LICENSE'), join(out, 'server', 'vendor', 'sql.js-LICENSE'))
cpSync(join(root, 'deploy', 'README.md'), join(out, 'README.md'))
cpSync(join(root, 'deploy', 'web.config'), join(out, 'web.config'))
writeFileSync(join(out, '.gitignore'), 'node_modules\nserver/data\niisnode\n')
cpSync(join(root, 'deploy', 'app.cjs'), join(out, 'app.cjs'))
const source = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
writeFileSync(
  join(out, 'package.json'),
  JSON.stringify(
    {
      name: source.name,
      private: true,
      version: source.version,
      type: 'module',
      description: 'ArteTotal deploy package. Built from the main branch by scripts/release.mjs; do not edit here.',
      engines: { node: '>=18.17' },
      scripts: { start: 'node app.cjs' },
      // Everything is bundled or vendored: there is nothing to install.
      dependencies: {},
    },
    null,
    2,
  ) + '\n',
)
console.log(`\nDeploy package ready in ${out}`)
if (!commit) process.exit(0)

// Commit the package as the whole content of the `release` branch, via a temporary worktree.
const sourceCommit = git(['rev-parse', '--short', 'HEAD'])
// On GitHub Actions a tag build has a detached HEAD, so name the tag or branch it ran for.
const sourceBranch = process.env.GITHUB_REF_NAME || git(['rev-parse', '--abbrev-ref', 'HEAD'])
const tree = join(root, '.release-worktree')
if (existsSync(tree)) git(['worktree', 'remove', '--force', tree])
git(['worktree', 'add', tree, 'release'])
try {
  for (const entry of readdirSync(tree)) if (entry !== '.git') rmSync(join(tree, entry), { recursive: true, force: true })
  cpSync(out, tree, { recursive: true })
  git(['add', '-A'], tree)
  if (!git(['status', '--porcelain'], tree)) {
    console.log('release branch is already up to date.')
  } else {
    git(['commit', '-q', '-m', `Release ${sourceBranch}@${sourceCommit}`], tree)
    console.log(`Committed to release: ${git(['log', '--oneline', '-1'], tree)}`)
  }
  if (push) run('git', ['push', 'origin', 'release'], { cwd: tree })
} finally {
  git(['worktree', 'remove', '--force', tree])
}
