import vue from '@vitejs/plugin-vue';
import builder from 'electron-builder';
import esbuild from 'esbuild';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import * as vite from 'vite';
import { getMainProcessCommonConfig } from './helpers.mjs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import liveBooksConfig from '../../electron-builder-config.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dirname, '..', '..');
const buildDirPath = path.join(root, 'dist_electron', 'build');
const packageDirPath = path.join(root, 'dist_electron', 'bundled');
const mainFileName = 'main.js';
const commonConfig = getMainProcessCommonConfig(root);

const rawArgs = yargs(hideBin(process.argv))
  .option('nosign', {
    type: 'boolean',
    description: 'Run electron-builder without code signing',
  })
  .option('nopackage', {
    type: 'boolean',
    description: 'Only build the source files, electron-builder will not run',
  });

const argv = rawArgs.argv;
if (argv.nosign) {
  process.env['CSC_IDENTITY_AUTO_DISCOVERY'] = false;
}

updatePaths();
await buildMainProcessSource();
copyPackagedWindowIcon();
await buildRendererProcessSource();
copyPackageJson();

if (!argv.nopackage) {
  await packageApp();
}

function updatePaths() {
  fs.removeSync(buildDirPath);
  fs.ensureDirSync(buildDirPath);
  fs.removeSync(packageDirPath);
  fs.ensureDirSync(packageDirPath);
  fs.ensureDirSync(path.join(buildDirPath, 'node_modules'));
}

async function buildMainProcessSource() {
  const result = await esbuild.build({
    ...commonConfig,
    outdir: path.join(buildDirPath),
  });

  if (result.errors.length) {
    console.error('app build failed due to main process source build');
    result.errors.forEach((err) => console.error(err));
    process.exit(1);
  }
}

function copyPackagedWindowIcon() {
  const appIcon = path.join(root, 'app-icon.png');
  const fallbackIcon = path.join(root, 'build', 'icon.png');
  const srcIcon = fs.existsSync(appIcon) ? appIcon : fallbackIcon;
  const destDir = path.join(buildDirPath, 'icons');
  fs.ensureDirSync(destDir);
  if (fs.existsSync(srcIcon)) {
    fs.copySync(srcIcon, path.join(destDir, '512x512.png'));
  }

  // Windows: prefer .ico to avoid runtime/OS fallbacks to Electron icon.
  const icoCandidates = [
    path.join(root, 'build', 'icon.ico'),
    path.join(root, 'build', 'installerIcon.ico'),
  ];
  const srcIco = icoCandidates.find((p) => fs.existsSync(p));
  if (srcIco) {
    fs.copySync(srcIco, path.join(destDir, 'icon.ico'));
  }
}

async function buildRendererProcessSource() {
  const base = 'app://';
  const outDir = path.join(buildDirPath, 'src');
  const livebooksCloudOrigin =
    process.env.VITE_LIVEBOOKS_CLOUD_ORIGIN ||
    process.env.LIVEBOOKS_CLOUD_ORIGIN ||
    'http://127.0.0.1:3000';
  await vite.build({
    base: `/${base}`,
    root: path.join(root, 'src'),
    build: { outDir, sourcemap: true },
    define: {
      'import.meta.env.VITE_LIVEBOOKS_CLOUD_ORIGIN':
        JSON.stringify(livebooksCloudOrigin),
    },
    plugins: [vue()],
    resolve: {
      alias: {
        vue: 'vue/dist/vue.esm-bundler.js',
        fyo: path.join(root, 'fyo'),
        src: path.join(root, 'src'),
        schemas: path.join(root, 'schemas'),
        backend: path.join(root, 'backend'),
        models: path.join(root, 'models'),
        utils: path.join(root, 'utils'),
        regional: path.join(root, 'regional'),
        reports: path.join(root, 'reports'),
        dummy: path.join(root, 'dummy'),
        fixtures: path.join(root, 'fixtures'),
      },
    },
  });
  removeBaseLeadingSlash(outDir, base);
}

/**
 * Copies the package.json file to the build folder with the
 * following changes:
 * - Irrelevant fields are removed.
 * - Non-external deps (those that are bundled) and devDeps are removed.
 * - Main file is updated to the bundled main process JS file.
 */
function copyPackageJson() {
  const packageJsonText = fs.readFileSync(path.join(root, 'package.json'), {
    encoding: 'utf-8',
  });

  const packageJson = JSON.parse(packageJsonText);
  const keys = [
    'name',
    'version',
    'description',
    'author',
    'homepage',
    'repository',
    'license',
  ];
  const modifiedPackageJson = {};
  for (const key of keys) {
    modifiedPackageJson[key] = packageJson[key];
  }

  modifiedPackageJson.main = mainFileName;
  modifiedPackageJson.dependencies = {};

  for (const dep of commonConfig.external) {
    modifiedPackageJson.dependencies[dep] = packageJson.dependencies[dep];
  }

  fs.writeFileSync(
    path.join(buildDirPath, 'package.json'),
    JSON.stringify(modifiedPackageJson, null, 2),
    {
      encoding: 'utf-8',
    }
  );
}

/**
 * Packages the app using electron builder.
 *
 * Note: this also handles signing and notarization if the
 * appropriate flags are set.
 *
 * Electron builder cli [commands](https://www.electron.build/cli)
 * are passed on as builderArgs.
 */
async function packageApp() {
  const { configureBuildCommand } = await await import(
    'electron-builder/out/builder.js'
  );

  const builderArgs = rawArgs
    .command(['build', '*'], 'Build', configureBuildCommand)
    .parse();

  for (const opt of ['nosign', 'nopackage']) {
    delete builderArgs[opt];
  }

  let buildOptions = {
    config: liveBooksConfig,
    ...builderArgs,
  };

  await builder.build(buildOptions);
}

/**
 * Removes leading slash from all renderer files
 * electron uses a custom registered protocol to load the
 * files: "app://"
 *
 * @param {string} dir
 * @param {string} base
 */
function removeBaseLeadingSlash(dir, base) {
  for (const file of fs.readdirSync(dir)) {
    const filePath = path.join(dir, file);
    if (fs.lstatSync(filePath).isDirectory()) {
      removeBaseLeadingSlash(filePath, base);
      continue;
    }

    const contents = fs.readFileSync(filePath).toString('utf-8');
    fs.writeFileSync(filePath, contents.replaceAll('/' + base, base));
  }
}
