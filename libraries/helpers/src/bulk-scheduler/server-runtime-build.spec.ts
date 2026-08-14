import { readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { transform } from '@swc/core';

const repositoryRoot = resolve(__dirname, '../../../..');
// The release builder is deliberately CommonJS so Docker can execute it
// before any application TypeScript has been emitted.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const builder = require(join(
  repositoryRoot,
  'scripts',
  'build-server-runtime.cjs'
));

describe('server runtime release builder', () => {
  it('derives a closed server-only dependency graph with required assets', async () => {
    const graph = await builder.collectDependencyGraph();
    const sources = graph.sources.map((file: string) =>
      relative(repositoryRoot, file).replaceAll('\\', '/')
    );
    const assets = graph.assets.map((file: string) =>
      relative(repositoryRoot, file).replaceAll('\\', '/')
    );

    expect(sources).toContain('apps/backend/src/main.ts');
    expect(sources).toContain('apps/orchestrator/src/main.ts');
    expect(sources.length).toBeGreaterThan(300);
    expect(sources.length).toBeLessThan(500);
    expect(sources.some((file: string) => /\.(spec|test)\.tsx?$/.test(file))).toBe(
      false
    );
    expect(
      sources.some(
        (file: string) =>
          file.startsWith('apps/frontend/') ||
          file.startsWith('libraries/react-shared-libraries/')
      )
    ).toBe(false);
    expect(assets).toContain('data/bulk-scheduler-capabilities.json');
    expect(assets).toContain(
      'libraries/nestjs-libraries/src/database/prisma/schema.prisma'
    );
    expect(
      assets.some((file: string) => file.endsWith('/migration.sql'))
    ).toBe(true);
  });

  it('uses portable, explicit SWC decorator and alias semantics', async () => {
    const sourcePath = join(
      repositoryRoot,
      'apps',
      'backend',
      'src',
      'app.module.ts'
    );
    const options = builder.swcOptions(
      sourcePath,
      'apps/backend/src/app.module.ts'
    );
    const output = await transform(await readFile(sourcePath, 'utf8'), options);

    expect(options.swcrc).toBe(false);
    expect(options.configFile).toBe(false);
    expect(options.jsc.transform.legacyDecorator).toBe(true);
    expect(options.jsc.transform.decoratorMetadata).toBe(true);
    expect(output.code).toContain('_ts_decorate');
    expect(output.code).toContain(
      'require("../../../libraries/nestjs-libraries/src/database/prisma/database.module")'
    );
  });

  it('generates a minimal, verified production dependency boundary', async () => {
    const graph = await builder.collectDependencyGraph();
    const manifest = await builder.expectedRuntimePackage(graph);

    expect(Object.keys(manifest.dependencies).length).toBeGreaterThan(50);
    expect(manifest.dependencies).toMatchObject({
      '@prisma/client': '6.5.0',
      express: '5.2.1',
      jsonwebtoken: '9.0.3',
      prisma: '6.5.0',
    });
    expect(manifest.dependencies).not.toHaveProperty('next');
    expect(manifest.dependencies).not.toHaveProperty('react');
    expect(manifest.devDependencies).toEqual({
      '@swc/core': '1.5.7',
      typescript: '5.5.4',
      yaml: '2.8.3',
    });
    expect(manifest.pnpm.patchedDependencies).toEqual({
      'file-type@16.5.4': '../../patches/file-type@16.5.4.patch',
    });
    await expect(builder.verifyRuntimePackage(graph)).resolves.toEqual({
      packageSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      lockSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(builder.externalPackageName('node:fs/promises')).toBeNull();
    expect(builder.externalPackageName('@gitroom/helpers/utils/timer')).toBeNull();
    expect(builder.externalPackageName('@aws-sdk/client-s3')).toBe(
      '@aws-sdk/client-s3'
    );
  });

  it('cannot clean any path other than the fixed build output', () => {
    expect(builder.assertSafeOutputRoot()).toBe(
      join(repositoryRoot, '.server-runtime')
    );
    expect(() => builder.assertSafeOutputRoot(repositoryRoot)).toThrow(
      /must be the repository \.server-runtime directory/
    );
    expect(builder.emittedPath('apps/backend/src/main.ts')).toBe(
      'apps/backend/src/main.js'
    );
  });
});
