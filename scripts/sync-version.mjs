// 版本号唯一来源：package.json。
// tauri.conf.json 直接引用 package.json 获取应用版本；
// Cargo.toml 无法引用 package.json，因此由本脚本同步其 crate 版本。
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const version = pkg.version

if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(version ?? '')) {
  console.error(`package.json 中的版本号无效：${version}`)
  process.exit(1)
}

const cargoPath = resolve(root, 'src-tauri/Cargo.toml')
const cargo = readFileSync(cargoPath, 'utf8')
const updated = cargo.replace(/^version = "[^"]*"$/m, `version = "${version}"`)

if (updated === cargo) {
  console.log(`Cargo.toml 版本已是 ${version}，无需修改`)
} else {
  writeFileSync(cargoPath, updated)
  console.log(`Cargo.toml 版本已同步为 ${version}`)
}
