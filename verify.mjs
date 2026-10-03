import { fetchApps } from './src/js/appsService.js'
const r = await fetchApps()
console.log('problem:', r.problem || '(none)')
console.log('apps   :', r.apps.length)
for (const a of r.apps) {
  console.log('')
  console.log('  name    :', a.name)
  console.log('  version :', a.version)
  console.log('  platform:', a.platform.label)
  console.log('  size    :', a.fileSize, '| sizeBytes:', a.size)
  console.log('  desc    :', (a.description || '(none)').slice(0, 60))
  console.log('  icon    :', a.icon || '(none)')
  console.log('  dl      :', a.downloadUrl)
  console.log('  dl ok   :', a.downloadOk)
}