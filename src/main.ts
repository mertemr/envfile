import * as core from '@actions/core'
import {camelCase} from 'camel-case'
import {constantCase} from 'constant-case'
import {writeFile, unlink, existsSync} from 'fs'
import {pascalCase} from 'pascal-case'
import {snakeCase} from 'snake-case'
import {resolve} from 'path'

const convertTypes: Record<string, (s: string) => string> = {
  lower: s => s.toLowerCase(),
  upper: s => s.toUpperCase(),
  camel: camelCase,
  constant: constantCase,
  pascal: pascalCase,
  snake: snakeCase
}

async function run(): Promise<void> {
  let excludeList = ['github_token']

  try {
    const secretsJson = core.getInput('secrets', {required: true})
    const file = core.getInput('file') || '.env'
    const noEnvInput = core.getInput('no_env')
    const keyPrefix = core.getInput('prefix') || ''
    const includeListStr = core.getInput('include')
    const excludeListStr = core.getInput('exclude')
    const convert = core.getInput('convert')
    const convertPrefixStr = core.getInput('convert_prefix')
    const overrideStr = core.getInput('override')
    const cleanStr = core.getInput('clean') || 'true'

    core.saveState('file', file)
    core.saveState('clean', cleanStr)

    const convertPrefix = convertPrefixStr === 'false' ? false : true
    const override = overrideStr === 'false' ? false : true
    const noEnv = noEnvInput === 'true'
    const convertFunc = convertTypes[convert]

    let secrets: Record<string, string>
    try {
      secrets = JSON.parse(secretsJson)
    } catch (e) {
      throw new Error(
        `Cannot parse JSON secrets.\nMake sure you add with:\n  secrets: \${{ toJSON(secrets) }}`
      )
    }

    let includeList: string[] | null = null
    if (includeListStr?.length) {
      includeList = includeListStr.split(',').map(key => key.trim())
    }

    if (excludeListStr?.length) {
      excludeList = excludeList.concat(
        excludeListStr.split(',').map(key => key.trim())
      )
    }

    let envFileContent = ''
    for (const key of Object.keys(secrets)) {
      if (includeList && !includeList.some(inc => key.match(new RegExp(inc))))
        continue
      if (excludeList.some(inc => key.match(new RegExp(inc)))) continue

      let newKey = keyPrefix.length ? `${keyPrefix}${key}` : key
      if (convert?.length && convertFunc) {
        newKey = convertPrefix
          ? convertFunc(newKey)
          : `${keyPrefix}${convertFunc(newKey.replace(keyPrefix, ''))}`
      }

      envFileContent += `${newKey}='${secrets[key]}'\n`

      if (!noEnv) {
        if (process.env[newKey]) {
          if (override) {
            core.warning(`Will re-write "${newKey}" environment variable.`)
          } else {
            core.info(`Skip overwriting secret ${newKey}`)
            continue
          }
        }
        core.exportVariable(newKey, secrets[key])
        core.info(`Exported secret ${newKey}`)
      }
    }

    if (file) {
      core.info(`Writing to file: ${file}`)
      writeFile(file, envFileContent, err => {
        if (err) throw err
      })
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

async function cleanup(): Promise<void> {
  try {
    const file = core.getState('file') || '.env'
    const clean = core.getState('clean') !== 'false'
    const filePath = resolve(process.cwd(), file)

    if (!clean) {
      core.info(`Clean is false. Skipping deletion of file ${file}`)
      return
    }

    if (existsSync(filePath)) {
      unlink(filePath, err => {
        if (err) {
          core.warning(`Failed to delete file ${file}: ${err.message}`)
        } else {
          core.info(`Successfully deleted file ${file}`)
        }
      })
    } else {
      core.warning(`File ${file} not found. Nothing to delete.`)
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

if (require.main === module) {
  const isPost =
    core.getState('isPost') === 'true' || process.env['STATE_isPost'] === 'true'

  if (isPost) {
    cleanup()
  } else {
    core.saveState('isPost', 'true')
    run()
  }
}
