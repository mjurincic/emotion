// @flow
const path = require('path')
const del = require('del')
const { promisify } = require('util')
const fs = require('fs')
const makeRollupConfig = require('./rollup.config')
const camelize = require('fbjs/lib/camelize')

const readdir = promisify(fs.readdir)

const rootPath = path.resolve(__dirname, '..', '..')

exports.rootPath = rootPath

exports.cleanDist = async function cleanDist(pkgPath /*: string */) {
  await del(`${pkgPath}/dist`)
}

/*::
import type { Package } from './types'
*/

let unsafeRequire = require

let pkgFolder = 'packages'

exports.getPackages = async function getPackages() /*: Promise<Array<Package>> */ {
  // we're intentionally not getting all the packages that are part of the monorepo
  // we only want ones in packages
  const packagePaths = (await readdir(path.join(rootPath, pkgFolder))).map(
    pkg => path.join(rootPath, pkgFolder, pkg)
  )

  const packages = packagePaths
    .map(packagePath => {
      const fullPackagePath = path.resolve(rootPath, packagePath)
      let pkgJSON
      try {
        pkgJSON = unsafeRequire(path.resolve(fullPackagePath, 'package.json'))
      } catch (e) {
        if (e.code === 'MODULE_NOT_FOUND') {
          return false
        }
        throw e
      }
      const ret /*: Package */ = {
        path: fullPackagePath,
        pkg: pkgJSON,
        configs: [],
        name: pkgJSON.name,
        input: path.resolve(fullPackagePath, 'src', 'index.js')
      }

      if (ret.pkg.main && !ret.pkg.main.includes('src')) {
        ret.configs.push({
          config: makeRollupConfig(ret, {
            isBrowser: false,
            isUMD: false,
            isProd: false,
            shouldMinifyButStillBePretty: false
          }),
          outputConfigs: getOutputConfigs(ret)
        })

        ret.configs.push({
          config: makeRollupConfig(ret, {
            isBrowser: false,
            isUMD: false,
            isProd: true,
            shouldMinifyButStillBePretty: true
          }),
          outputConfigs: [
            {
              format: 'cjs',
              file: getProdPath(getPath(ret, 'main', false)),
              exports: 'named'
            }
          ]
        })
      }
      if (ret.pkg['umd:main']) {
        ret.configs.push({
          config: makeRollupConfig(ret, {
            isBrowser: true,
            isUMD: true,
            isProd: false,
            shouldMinifyButStillBePretty: false
          }),
          outputConfigs: [getUMDOutputConfig(ret)]
        })
      }
      if (ret.pkg.browser) {
        ret.configs.push({
          config: makeRollupConfig(ret, {
            isBrowser: true,
            isUMD: false,
            isProd: false,
            shouldMinifyButStillBePretty: false
          }),
          outputConfigs: getOutputConfigs(ret, true)
        })
      }
      return ret
    })
    .filter(Boolean)
  // $FlowFixMe
  return packages
}

function getPath(
  pkg /*: Object */,
  field /*: string */,
  isBrowser /*: boolean */
) {
  return path.resolve(
    pkg.path,
    isBrowser && pkg.pkg.browser && pkg.pkg.browser['./' + pkg.pkg[field]]
      ? pkg.pkg.browser['./' + pkg.pkg[field]]
      : pkg.pkg[field]
  )
}

exports.getPath = getPath

function getDevPath(cjsPath /*: string */) {
  return cjsPath.replace('.js', '.dev.js')
}

function getProdPath(cjsPath /*: string */) {
  return cjsPath.replace('.js', '.prod.js')
}

Object.assign(exports, {
  getPath,
  getDevPath,
  getProdPath
})

function getOutputConfigs(pkg, isBrowser = false) {
  const cjsPath = getPath(pkg, 'main', isBrowser)
  let configs = [
    {
      format: 'cjs',
      file: isBrowser ? cjsPath : getDevPath(cjsPath),
      exports: 'named'
    }
  ]
  if (pkg.pkg.module) {
    const esmPath = getPath(pkg, 'module', isBrowser)

    configs.push({
      format: 'es',
      file: esmPath
    })
  }
  return configs
}

function getUMDOutputConfig(pkg) {
  const UMDPath = path.resolve(pkg.path, pkg.pkg['umd:main'])
  let name = camelize(pkg.pkg.name.replace('@', '').replace('/', '-'))
  return {
    format: 'umd',
    sourcemap: true,
    file: UMDPath,
    name,
    globals: { react: 'React', '@emotion/core': 'emotionCore' }
  }
}
