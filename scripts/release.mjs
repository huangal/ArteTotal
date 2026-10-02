#!/usr/bin/env node
/**
 * Builds the deploy package for hosts on Node 18 (e.g. cPanel "Setup Node.js App"),
 * which can't run the build tools or TypeScript themselves.
 *
 *   node scripts/release.mjs                    builds it into .release/
 *   node scripts/release.mjs --commit           also commits it to the `release` branch
 *   node scripts/release.mjs --commit --push    and pushes that branch to origin
 *
 * The package holds the built site (dist/), the compiled API (server/*.js), a package.json
 * with only the runtime dependencies, and app.cjs, the startup file for Passenger.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const out = join(root, '.release')
const commit = process.argv.includes('--commit')
const push = process.argv.includes('--push')

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts })
const git = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const version = (pkg) => JSON.parse(readFileSync(join(root, 'node_modules', pkg, 'package.json'), 'utf8')).version

if (commit && git(['status', '--porcelain'])) {
  console.error('Commit or stash your changes first, so the release matches a commit on this branch.')
  process.exit(1)
}

// Build the site and compile the API.
rmSync(join(root, 'build'), { recursive: true, force: true })
run('npm', ['run', 'build'])
run('npx', ['tsc', '-p', 'tsconfig.server.build.json'])

// Assemble the package.
rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'server'), { recursive: true })
cpSync(join(root, 'dist'), join(out, 'dist'), { recursive: true })
for (const file of readdirSync(join(root, 'build', 'server'))) {
  if (file.endsWith('.js') && !file.endsWith('.test.js')) cpSync(join(root, 'build', 'server', file), join(out, 'server', file))
}
cpSync(join(root, 'deploy', 'README.md'), join(out, 'README.md'))
writeFileSync(join(out, '.gitignore'), 'node_modules\nserver/data\n')
writeFileSync(
  join(out, 'app.cjs'),
  `// Startup file for Passenger (cPanel "Setup Node.js App"), which loads it with require().
// On Node 18, require() can't load ES modules, so this imports the server instead.
import('./server/index.js').catch((err) => {
  console.error(err)
  process.exit(1)
})
`,
)
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
      dependencies: {
        '@hono/node-server': version('@hono/node-server'),
        // Native SQLite for Node versions without node:sqlite. 11.x is the last line supporting Node 18.
        'better-sqlite3': '11.10.0',
        hono: version('hono'),
      },
    },
    null,
    2,
  ) + '\n',
)
console.log(`\nDeploy package ready in ${out}`)
if (!commit) process.exit(0)

// Commit the package as the whole content of the `release` branch, via a temporary worktree.
const sourceCommit = git(['rev-parse', '--short', 'HEAD'])
const sourceBranch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
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
