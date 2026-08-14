#!/usr/bin/env node

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { builtinModules } = require('node:module');
const os = require('node:os');
const path = require('node:path');
const swc = require('@swc/core');
const swcPackage = require('@swc/core/package.json');
const ts = require('typescript');
const YAML = require('yaml');

const REPOSITORY_ROOT = path.resolve(__dirname, '..');
const OUTPUT_ROOT = path.join(REPOSITORY_ROOT, '.server-runtime');
const SOURCE_ROOTS = Object.freeze([
  'apps/backend/src',
  'apps/orchestrator/src',
  'libraries/helpers/src',
  'libraries/nestjs-libraries/src',
]);
const ENTRY_POINTS = Object.freeze([
  'apps/backend/src/main.ts',
  'apps/orchestrator/src/main.ts',
]);
const REQUIRED_ASSET_ROOTS = Object.freeze([
  'libraries/nestjs-libraries/src/database/prisma/schema.prisma',
  'libraries/nestjs-libraries/src/database/prisma/migrations',
]);
const RUNTIME_SCRIPT_ENTRY_POINTS = Object.freeze([
  'scripts/provision-bulk-canary.cjs',
]);
const REQUIRED_RUNTIME_PACKAGES = Object.freeze(['prisma']);
const SERVER_BUILD_PACKAGES = Object.freeze([
  '@swc/core',
  'typescript',
  'yaml',
]);
const RUNTIME_PACKAGE_PATH = path.join(
  REPOSITORY_ROOT,
  'deploy',
  'server-runtime',
  'package.json'
);
const RUNTIME_LOCK_PATH = path.join(
  REPOSITORY_ROOT,
  'deploy',
  'server-runtime',
  'pnpm-lock.yaml'
);
const BUILTIN_PACKAGES = new Set(
  builtinModules.flatMap((name) => [name, name.replace(/^node:/, '')])
);
const ALIAS_PATHS = Object.freeze({
  '@gitroom/backend/*': ['apps/backend/src/*'],
  '@gitroom/orchestrator/*': ['apps/orchestrator/src/*'],
  '@gitroom/helpers/*': ['libraries/helpers/src/*'],
  '@gitroom/nestjs-libraries/*': ['libraries/nestjs-libraries/src/*'],
  '@gitroom/frontend/*': ['apps/frontend/src/*'],
  '@gitroom/react/*': ['libraries/react-shared-libraries/src/*'],
});

function posix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function sha256(contents) {
  return crypto.createHash('sha256').update(contents).digest('hex');
}

function externalPackageName(specifier) {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('@gitroom/') ||
    specifier.startsWith('node:')
  ) {
    return null;
  }
  const name = specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
  return BUILTIN_PACKAGES.has(name) ? null : name;
}

function patchedPackageName(selector) {
  const separator = selector.lastIndexOf('@');
  return separator > 0 ? selector.slice(0, separator) : selector;
}

function isTestSource(relativePath) {
  const normalized = posix(relativePath);
  return (
    /(?:^|\/)__tests__\//.test(normalized) ||
    /\.(?:spec|test|e2e)\.tsx?$/.test(normalized) ||
    /\.d\.ts$/.test(normalized)
  );
}

function isTypeScript(relativePath) {
  return /\.tsx?$/.test(relativePath);
}

function emittedPath(relativePath) {
  return relativePath.replace(/\.tsx?$/, '.js');
}

function workerCount(env = process.env) {
  const available =
    typeof os.availableParallelism === 'function'
      ? os.availableParallelism()
      : os.cpus().length;
  const requested = Number(env.PUBLISHLY_SERVER_BUILD_WORKERS || 0);
  if (Number.isInteger(requested) && requested > 0) {
    return Math.min(requested, 16);
  }
  return Math.max(1, Math.min(available, 8));
}

function assertSafeOutputRoot(outputRoot = OUTPUT_ROOT) {
  const resolved = path.resolve(outputRoot);
  const relative = path.relative(REPOSITORY_ROOT, resolved);
  if (relative !== '.server-runtime' || relative.startsWith('..')) {
    throw new Error(
      'Server runtime output must be the repository .server-runtime directory.'
    );
  }
  return resolved;
}

async function walk(directory) {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolute)));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

function resolveInternalImport(specifier, importer) {
  let unresolved;
  if (specifier.startsWith('.')) {
    unresolved = path.resolve(path.dirname(importer), specifier);
  } else {
    const alias = Object.entries(ALIAS_PATHS).find(([pattern]) =>
      specifier.startsWith(pattern.slice(0, -1))
    );
    if (!alias) return null;
    const [pattern, destinations] = alias;
    const suffix = specifier.slice(pattern.length - 1);
    unresolved = path.join(
      REPOSITORY_ROOT,
      destinations[0].slice(0, -1),
      suffix
    );
  }
  const candidates = [
    unresolved,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    `${unresolved}.json`,
    path.join(unresolved, 'index.ts'),
    path.join(unresolved, 'index.tsx'),
    path.join(unresolved, 'index.json'),
  ];
  return (
    candidates.find(
      (candidate) =>
        fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    ) || null
  );
}

async function collectDependencyGraph() {
  const pending = ENTRY_POINTS.map((entry) =>
    path.join(REPOSITORY_ROOT, entry)
  );
  const sources = new Set();
  const assets = new Set();
  while (pending.length) {
    const current = pending.shift();
    if (!current || sources.has(current) || assets.has(current)) continue;
    if (!isTypeScript(current)) {
      assets.add(current);
      continue;
    }
    sources.add(current);
    const contents = await fsp.readFile(current, 'utf8');
    const imports = ts.preProcessFile(contents, true, true).importedFiles;
    for (const imported of imports) {
      const resolved = resolveInternalImport(imported.fileName, current);
      if (resolved && !sources.has(resolved) && !assets.has(resolved)) {
        pending.push(resolved);
      } else if (
        !resolved &&
        (imported.fileName.startsWith('.') ||
          imported.fileName.startsWith('@gitroom/'))
      ) {
        throw new Error(
          `Unresolved internal import ${imported.fileName} from ${posix(
            path.relative(REPOSITORY_ROOT, current)
          )}.`
        );
      }
    }
  }
  for (const required of REQUIRED_ASSET_ROOTS) {
    const absolute = path.join(REPOSITORY_ROOT, required);
    const stat = await fsp.stat(absolute);
    if (stat.isDirectory()) {
      for (const asset of await walk(absolute)) assets.add(asset);
    } else {
      assets.add(absolute);
    }
  }
  return {
    sources: [...sources].sort((left, right) => left.localeCompare(right)),
    assets: [...assets].sort((left, right) => left.localeCompare(right)),
  };
}

async function collectExternalPackages(graph) {
  const packages = new Set(REQUIRED_RUNTIME_PACKAGES);
  const files = [
    ...graph.sources,
    ...RUNTIME_SCRIPT_ENTRY_POINTS.map((entry) =>
      path.join(REPOSITORY_ROOT, entry)
    ),
  ];
  for (const file of files) {
    const contents = await fsp.readFile(file, 'utf8');
    const imports = ts.preProcessFile(contents, true, true).importedFiles;
    for (const imported of imports) {
      const packageName = externalPackageName(imported.fileName);
      if (packageName) packages.add(packageName);
    }
  }
  return [...packages].sort((left, right) => left.localeCompare(right));
}

async function expectedRuntimePackage(graph) {
  const rootPackage = JSON.parse(
    await fsp.readFile(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8')
  );
  const declared = {
    ...rootPackage.dependencies,
    ...rootPackage.optionalDependencies,
    ...rootPackage.devDependencies,
  };
  const rootLock = YAML.parse(
    await fsp.readFile(path.join(REPOSITORY_ROOT, 'pnpm-lock.yaml'), 'utf8')
  );
  const importer = rootLock?.importers?.['.'];
  if (!importer) {
    throw new Error('The root pnpm lockfile importer is missing.');
  }
  const locked = {
    ...importer.dependencies,
    ...importer.optionalDependencies,
    ...importer.devDependencies,
  };
  const lockedVersion = (name) => {
    const value = locked[name]?.version;
    if (typeof value !== 'string' || /^(?:link|workspace):/.test(value)) {
      throw new Error(`No immutable root lock resolution exists for ${name}.`);
    }
    return value.replace(/\(.+$/, '');
  };
  const runtimePackages = await collectExternalPackages(graph);
  const missing = runtimePackages.filter((name) => !declared[name]);
  if (missing.length) {
    throw new Error(
      `Runtime imports must be direct workspace dependencies: ${missing.join(
        ', '
      )}.`
    );
  }
  const missingBuild = SERVER_BUILD_PACKAGES.filter((name) => !declared[name]);
  if (missingBuild.length) {
    throw new Error(
      `Server build dependencies are undeclared: ${missingBuild.join(', ')}.`
    );
  }
  return {
    name: '@publishly/server-runtime-dependencies',
    version: '1.0.0',
    private: true,
    packageManager: 'pnpm@10.6.1',
    description: 'Generated dependency boundary for Publishly API and workers.',
    dependencies: Object.fromEntries(
      runtimePackages.map((name) => [name, lockedVersion(name)])
    ),
    devDependencies: Object.fromEntries(
      SERVER_BUILD_PACKAGES.map((name) => [name, lockedVersion(name)])
    ),
    pnpm: {
      overrides: rootPackage.pnpm?.overrides || {},
      onlyBuiltDependencies: rootPackage.pnpm?.onlyBuiltDependencies || [],
      patchedDependencies: Object.fromEntries(
        Object.entries(rootPackage.pnpm?.patchedDependencies || {})
          .filter(([name]) =>
            runtimePackages.includes(patchedPackageName(name))
          )
          .map(([name, patchPath]) => [name, `../../${patchPath}`])
      ),
    },
  };
}

function serializedPackage(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

async function verifyRuntimePackage(graph) {
  const manifest = await expectedRuntimePackage(graph);
  const expected = serializedPackage(manifest);
  const actual = await fsp
    .readFile(RUNTIME_PACKAGE_PATH, 'utf8')
    .catch(() => '');
  if (actual !== expected) {
    throw new Error(
      'Generated server runtime dependencies are stale. Run `pnpm generate:server-runtime-package`.'
    );
  }
  const lockContents = await fsp
    .readFile(RUNTIME_LOCK_PATH, 'utf8')
    .catch(() => '');
  let lock;
  try {
    lock = YAML.parse(lockContents);
  } catch {
    lock = null;
  }
  const importer = lock?.importers?.['.'];
  const matchesSection = (name, expectedDependencies) => {
    const actualDependencies = importer?.[name] || {};
    const expectedNames = Object.keys(expectedDependencies).sort();
    const actualNames = Object.keys(actualDependencies).sort();
    return (
      JSON.stringify(actualNames) === JSON.stringify(expectedNames) &&
      expectedNames.every(
        (dependency) =>
          actualDependencies[dependency]?.specifier ===
          expectedDependencies[dependency]
      )
    );
  };
  if (
    !matchesSection('dependencies', manifest.dependencies) ||
    !matchesSection('devDependencies', manifest.devDependencies)
  ) {
    throw new Error(
      'Standalone server runtime lockfile is stale. Regenerate deploy/server-runtime/pnpm-lock.yaml with pnpm 10.6.1 and --ignore-workspace.'
    );
  }
  return {
    packageSha256: sha256(expected),
    lockSha256: sha256(lockContents),
  };
}

async function writeRuntimePackage() {
  const graph = await collectDependencyGraph();
  const contents = serializedPackage(await expectedRuntimePackage(graph));
  await fsp.mkdir(path.dirname(RUNTIME_PACKAGE_PATH), { recursive: true });
  await fsp.writeFile(RUNTIME_PACKAGE_PATH, contents, {
    encoding: 'utf8',
    mode: 0o644,
  });
  return {
    package: posix(path.relative(REPOSITORY_ROOT, RUNTIME_PACKAGE_PATH)),
    sha256: sha256(contents),
  };
}

function swcOptions(sourcePath, relativePath) {
  return {
    filename: sourcePath,
    sourceFileName: posix(relativePath),
    swcrc: false,
    configFile: false,
    sourceMaps: true,
    inlineSourcesContent: false,
    jsc: {
      parser: {
        syntax: 'typescript',
        tsx: sourcePath.endsWith('.tsx'),
        decorators: true,
        dynamicImport: true,
      },
      target: 'es2021',
      baseUrl: REPOSITORY_ROOT,
      paths: ALIAS_PATHS,
      keepClassNames: true,
      transform: {
        legacyDecorator: true,
        decoratorMetadata: true,
      },
      loose: true,
    },
    module: {
      type: 'commonjs',
      strict: false,
      strictMode: true,
      lazy: false,
      noInterop: false,
    },
  };
}

async function writeFile(absolutePath, contents) {
  await fsp.mkdir(path.dirname(absolutePath), { recursive: true });
  await fsp.writeFile(absolutePath, contents, { mode: 0o644 });
}

async function compileSource(sourcePath, outputRoot = OUTPUT_ROOT) {
  const relativePath = path.relative(REPOSITORY_ROOT, sourcePath);
  const source = await fsp.readFile(sourcePath);
  const transformed = await swc.transform(
    source.toString('utf8'),
    swcOptions(sourcePath, relativePath)
  );
  const outputRelativePath = emittedPath(relativePath);
  const outputPath = path.join(outputRoot, outputRelativePath);
  const sourceMapPath = `${outputPath}.map`;
  const code = `${transformed.code}\n//# sourceMappingURL=${path.basename(
    sourceMapPath
  )}\n`;
  await writeFile(outputPath, code);
  await writeFile(sourceMapPath, transformed.map || '');
  return {
    source: posix(relativePath),
    output: posix(outputRelativePath),
    sourceSha256: sha256(source),
    outputSha256: sha256(code),
  };
}

async function copyAsset(sourcePath, outputRoot = OUTPUT_ROOT) {
  const relativePath = path.relative(REPOSITORY_ROOT, sourcePath);
  const outputPath = path.join(outputRoot, relativePath);
  const contents = await fsp.readFile(sourcePath);
  await writeFile(outputPath, contents);
  return {
    source: posix(relativePath),
    output: posix(relativePath),
    sha256: sha256(contents),
  };
}

async function mapBounded(items, limit, operation) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await operation(items[index]);
      }
    })
  );
  return results;
}

async function buildServerRuntime() {
  const outputRoot = assertSafeOutputRoot();
  await fsp.rm(outputRoot, { recursive: true, force: true });
  await fsp.mkdir(outputRoot, { recursive: true });

  const graph = await collectDependencyGraph();
  const runtimeDependencyEvidence = await verifyRuntimePackage(graph);
  const sources = graph.sources.filter(
    (file) => !isTestSource(path.relative(REPOSITORY_ROOT, file))
  );
  const assets = graph.assets.filter(
    (file) => !file.endsWith('.tsbuildinfo')
  );
  const workers = workerCount();
  const compiled = await mapBounded(sources, workers, (source) =>
    compileSource(source, outputRoot)
  );
  const copied = await mapBounded(assets, workers, (asset) =>
    copyAsset(asset, outputRoot)
  );
  const manifest = {
    schemaVersion: 1,
    compiler: `@swc/core@${swcPackage.version}`,
    target: 'es2021-commonjs',
    workers,
    entryPoints: ENTRY_POINTS,
    requiredAssetRoots: REQUIRED_ASSET_ROOTS,
    runtimePackageSha256: runtimeDependencyEvidence.packageSha256,
    runtimeLockSha256: runtimeDependencyEvidence.lockSha256,
    compiled,
    assets: copied,
  };
  await writeFile(
    path.join(outputRoot, 'build-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  return {
    compiler: manifest.compiler,
    filesCompiled: compiled.length,
    assetsCopied: copied.length,
    workers,
    output: posix(path.relative(REPOSITORY_ROOT, outputRoot)),
    manifestSha256: sha256(JSON.stringify(manifest)),
  };
}

async function main() {
  const command = process.argv[2] || 'build';
  const result =
    command === '--write-dependencies'
      ? await writeRuntimePackage()
      : command === '--check-dependencies'
      ? await verifyRuntimePackage(await collectDependencyGraph())
      : command === 'build'
      ? await buildServerRuntime()
      : (() => {
          throw new Error(`Unknown server runtime build command: ${command}.`);
        })();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        verdict: 'FAIL',
        code: 'server_runtime_build_failed',
        reason: error instanceof Error ? error.message : String(error),
      })}\n`
    );
    process.exitCode = 1;
  });
}

module.exports = {
  ALIAS_PATHS,
  BUILTIN_PACKAGES,
  ENTRY_POINTS,
  OUTPUT_ROOT,
  REPOSITORY_ROOT,
  REQUIRED_ASSET_ROOTS,
  REQUIRED_RUNTIME_PACKAGES,
  RUNTIME_PACKAGE_PATH,
  RUNTIME_LOCK_PATH,
  RUNTIME_SCRIPT_ENTRY_POINTS,
  SERVER_BUILD_PACKAGES,
  SOURCE_ROOTS,
  assertSafeOutputRoot,
  buildServerRuntime,
  collectDependencyGraph,
  collectExternalPackages,
  compileSource,
  emittedPath,
  expectedRuntimePackage,
  externalPackageName,
  isTestSource,
  mapBounded,
  patchedPackageName,
  resolveInternalImport,
  swcOptions,
  verifyRuntimePackage,
  workerCount,
  writeRuntimePackage,
};
