const { readFileSync, writeFileSync } = require('fs');
const { resolve } = require('path');

const root = resolve(__dirname, '..');
const sourcePath = resolve(root, 'data/bulk-scheduler-capabilities.json');
const outputPath = resolve(root, 'docs/BULK_SCHEDULER_CAPABILITIES.md');
const matrix = JSON.parse(readFileSync(sourcePath, 'utf8'));

const escape = (value) => String(value).replaceAll('|', '\\|');
const rows = matrix.tuples
  .map(
    (tuple) =>
      `| \`${escape(tuple.id)}\` | ${escape(tuple.transportMode)} | ${
        tuple.adapterImplemented ? 'yes' : 'no'
      } | ${tuple.privateTransportReady ? 'yes' : 'no'} | ${
        tuple.confirmationImplemented ? 'yes' : 'no'
      } | ${tuple.ambiguityRecoveryImplemented ? 'yes' : 'no'} | ${
        escape(tuple.ambiguityRecoveryMethod)
      } | ${escape(tuple.certificationStatus)} | ${
        tuple.defaultEligible &&
        tuple.adapterImplemented &&
        tuple.privateTransportReady &&
        tuple.confirmationImplemented &&
        tuple.ambiguityRecoveryImplemented &&
        tuple.certificationStatus === 'certified' &&
        tuple.certificationEvidence
          ? 'enabled'
          : 'disabled'
      } | \`${escape(tuple.killSwitchEnv)}\` |`
  )
  .join('\n');

const output = `<!-- GENERATED FILE: pnpm generate:bulk-capabilities -->
# Bulk Scheduler capability matrix

Matrix schema version: **${matrix.schemaVersion}**  
Last authored update: **${matrix.updated}**  
Unknown tuple policy: **${matrix.unknownTuplePolicy}**

This document is generated from
\`data/bulk-scheduler-capabilities.json\`. It is not an independent product
claim. A row is customer-eligible only after implementation, private transport,
provider read-back, ambiguous-mutation recovery, controlled real-provider certification, default release,
and all kill-switch checks pass.

| Exact tuple | Transport | Adapter | Private transport | Confirmation | Ambiguity safe | Ambiguity method | Canary | Customer default | Kill switch |
|---|---|---:|---:|---:|---:|---|---|---|---|
${rows}

## Runtime controls

- Global kill switch: \`${matrix.globalKillSwitchEnv}\`
- Controlled canary mode: \`${matrix.canaryModeEnv}\`
- Explicit canary tuple list: \`${matrix.canaryTupleListEnv}\`
- Explicit canary integration list: \`${matrix.canaryIntegrationListEnv}\`
- A canary override never makes a tuple customer-eligible.
`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(outputPath, 'utf8');
  } catch {}
  if (current.replaceAll('\r\n', '\n') !== output.replaceAll('\r\n', '\n')) {
    console.error('Bulk Scheduler capability documentation is out of date.');
    process.exit(1);
  }
  console.log('Bulk Scheduler capability documentation is current.');
} else {
  writeFileSync(outputPath, output);
  console.log(`Wrote ${outputPath}`);
}
