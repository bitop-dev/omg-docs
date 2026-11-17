import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { editUrl, productRepo, productVersion, productImageDigest } from '../lib/site.ts';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const historicalImage = 'ghcr.io/ncecere/open-model-gateway';
const historicalIdentity = 'https://github.com/ncecere/open-model-gateway/.github/workflows/image.yml@refs/tags/v0.10.0';
const digest = 'sha256:77a37910d5af8ef26cdacec1f7dac026ba2aee32d9de8fd8ab30c039adbcdbe6';
const historicalDigests = {
  'v0.3.0': '',
  'v0.6.1': 'sha256:4125f40b679fdb0ca846a863c131d53459c665b2ab1c41b270af1bcdfa9a9dbe',
  'v0.7.0': 'sha256:341d104ccb90e5fcda58856240b3b38413bfb0299dfcca532b67302592b200d3',
  'v0.7.1': 'sha256:8e3fba7871fcb6f6e25dcb7bcb209a18731eb2b3cd7f65c27be7668d9ff831a3',
  'v0.7.2': 'sha256:1acdb4bedda74baf5c196913f0823c72ff44a1abfdb04666d94843731e3e0376',
  'v0.8.0': 'sha256:cd42d60638552c6f39a566732f74775d0a3df032ba9c14a058011ecf5296ebda',
  'v0.9.0': 'sha256:fb4ac91bae8aeeed8da5f1203d610c03c0202b60fe236db69e2470a2d816fb39',
  'v0.9.1': 'sha256:da03b565093fded73b6ddbc636d56b60811b4c5dcbfc4956ce62bf4efe0cb819',
  'v0.9.2': 'sha256:c4bb844addeebeadfe3e71c9f756c22e55eccf1d9474958995436e64a43f4b44',
  'v0.9.3': 'sha256:b345e16645b0dd145bb3c9562d13d1c09b9e782fbf7874fad4af088482256d45',
  'v0.10.0': digest,
};

test('navigation and edit links use the transferred repositories', () => {
  assert.equal(productRepo, 'https://github.com/bitop-dev/open-model-gateway');
  assert.equal(editUrl('content/docs/self-hosting/container.mdx'),
    'https://github.com/bitop-dev/omg-docs/blob/main/content/docs/self-hosting/container.mdx');
});

test('docs publishing and image metadata use the organization package', () => {
  const workflow = read('.github/workflows/publish.yaml');
  const tags = [...workflow.matchAll(/^\s+(ghcr\.io\/[^\r\n]+)$/gm)].map((match) => match[1]);
  assert.deepEqual(tags, [
    'ghcr.io/bitop-dev/omg-docs:${{ github.sha }}',
    'ghcr.io/bitop-dev/omg-docs:latest',
  ]);
  assert.match(read('Dockerfile'), /org\.opencontainers\.image\.source="https:\/\/github\.com\/bitop-dev\/omg-docs"/);
  assert.match(read('README.md'), /ghcr\.io\/bitop-dev\/omg-docs:<full commit sha>/);
  assert.match(read('README.md'), /ghcr\.io\/bitop-dev\/omg-docs:latest/);
});

test('v0.10.0 pull examples and signature identity remain historical', () => {
  assert.equal(productVersion, 'v0.10.0');
  assert.equal(productImageDigest, digest);
  const page = read('content/docs/self-hosting/container.mdx');
  assert.ok(page.includes(`cosign verify ${historicalImage}@${digest}`));
  assert.equal(page.match(/--certificate-identity\s+(\S+)/)?.[1], historicalIdentity);
  assert.ok(page.includes('--certificate-oidc-issuer https://token.actions.githubusercontent.com'));
  // Pull, migrate, provision-user and Compose all use the same released bytes.
  assert.equal(page.split(`${historicalImage}:v0.10.0@${digest}`).length - 1, 4);
  assert.ok(!page.includes('ghcr.io/bitop-dev/open-model-gateway:v0.10.0'));
});

test('historical release pages keep their complete original image references', () => {
  for (const name of readdirSync(new URL('content/docs/releases/', root))) {
    if (!/^v[\d-]+\.mdx$/.test(name)) continue;
    const page = read(`content/docs/releases/${name}`);
    const version = name.replace('.mdx', '').replaceAll('-', '.');
    const expected = Object.hasOwn(historicalDigests, version)
      ? [`${historicalImage}:${version}${historicalDigests[version] ? `@${historicalDigests[version]}` : ''}`]
      : [];
    assert.deepEqual([...page.matchAll(/ghcr\.io\/[^\s`]+/g)].map((match) => match[0]), expected, name);
  }
});

test('source links move while the exact historical signing identity stays', () => {
  function check(path) {
    for (const match of read(path).matchAll(/(?:https:\/\/)?github\.com\/ncecere\/[^\s`'"<>\)]+/g)) {
      assert.equal(match[0], historicalIdentity, `${path}: old repository link`);
    }
  }
  function walk(path) {
    for (const entry of readdirSync(new URL(`${path}/`, root), { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (/\.(mdx?|tsx?|css)$/.test(entry.name)) check(child);
    }
  }
  for (const path of ['content', 'lib', 'app', 'components']) walk(path);
  check('README.md');
  check('Dockerfile');
});
