import test from 'tape';
import {
  isStagingCloudOrigin,
  livebooksDesktopDisplayName,
  normalizeLivebooksAppEnvVar,
  resolveLivebooksAppEnv,
} from 'utils/livebooksAppEnv';

test('normalizeLivebooksAppEnvVar accepts common aliases', (t) => {
  t.equal(normalizeLivebooksAppEnvVar('dev'), 'development');
  t.equal(normalizeLivebooksAppEnvVar('STAGING'), 'staging');
  t.equal(normalizeLivebooksAppEnvVar('prod'), 'production');
  t.equal(normalizeLivebooksAppEnvVar(''), null);
  t.end();
});

test('resolveLivebooksAppEnv prefers LIVEBOOKS_APP_ENV', (t) => {
  t.equal(
    resolveLivebooksAppEnv({
      livebooksAppEnv: 'staging',
      nodeEnv: 'development',
      cloudOrigin: 'http://127.0.0.1:3000',
    }),
    'staging'
  );
  t.end();
});

test('resolveLivebooksAppEnv uses NODE_ENV when env var unset', (t) => {
  t.equal(
    resolveLivebooksAppEnv({
      nodeEnv: 'development',
      cloudOrigin: 'https://cloud.staging.example.com',
    }),
    'development'
  );
  t.end();
});

test('resolveLivebooksAppEnv infers staging from cloud origin', (t) => {
  t.equal(
    resolveLivebooksAppEnv({
      cloudOrigin: 'https://cloud.staging.livebooks.io',
    }),
    'staging'
  );
  t.equal(
    resolveLivebooksAppEnv({
      cloudOrigin: 'https://stg.api.example.com',
    }),
    'staging'
  );
  t.equal(
    resolveLivebooksAppEnv({
      cloudOrigin: 'http://127.0.0.1:3000',
    }),
    'production'
  );
  t.end();
});

test('isStagingCloudOrigin ignores localhost', (t) => {
  t.notOk(isStagingCloudOrigin('http://127.0.0.1:3000'));
  t.ok(isStagingCloudOrigin('https://staging.cloud.example.com'));
  t.end();
});

test('livebooksDesktopDisplayName appends env suffix', (t) => {
  t.equal(
    livebooksDesktopDisplayName('development'),
    'LiveBooks Desktop (Dev)'
  );
  t.equal(
    livebooksDesktopDisplayName('staging', true),
    'LiveBooks Desktop Pro (Staging)'
  );
  t.end();
});
