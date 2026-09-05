import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  enumerateLinePaths,
  lineIndexToLumiplanLine,
  stopToLumiplanStop,
  toLumiplanMode,
} from '../utils/lumiplan'

const PRESET_ROOT = join(import.meta.dirname, '..', 'data', 'presets')
const OUTPUT = process.argv[2] ?? join(import.meta.dirname, '..', 'lumiplan-presets.json')

const MODE_LABELS: Record<string, string> = {
  METRO: 'Métro',
  RER: 'RER',
  TRANSILIEN: 'Transilien',
  TRAM: 'Tramway',
  TRAM_TRAIN: 'Tram-train',
}

interface PresetBundleEntry {
  id: string
  label: string
  line: ReturnType<typeof lineIndexToLumiplanLine>
  paths: {
    label: string
    stops: ReturnType<typeof stopToLumiplanStop>[]
  }[]
}

const entries: PresetBundleEntry[] = []
const seen = new Set<string>()

for (const folder of readdirSync(PRESET_ROOT, { withFileTypes: true })) {
  if (!folder.isDirectory()) continue
  const dir = join(PRESET_ROOT, folder.name)

  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.json')) continue
    const project = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Project
    const { line } = project
    if (!line?.mode || !line.index || !('$builtinLineIndex' in line.index)) continue

    const key = `${line.mode}:${line.index.$builtinLineIndex.index}`
    if (seen.has(key)) continue // doublons (ex. tram_11 / tram_train_11)
    seen.add(key)

    const customIndices = project.customIndices ?? []
    const lumiplanLine = lineIndexToLumiplanLine(line.index, customIndices, line.color)
    const lumiplanMode = toLumiplanMode(line.mode)
    if (!lumiplanLine || !lumiplanMode) continue

    const paths = enumerateLinePaths(line.topology).map(path => ({
      label: path.label,
      stops: path.stops.map(stop => stopToLumiplanStop(stop, customIndices)),
    }))
    if (paths.length === 0) {
      console.warn(`⚠ ${key} : aucun chemin exploitable, preset ignoré`)
      continue
    }

    const modeLabel = MODE_LABELS[lumiplanMode] ?? lumiplanMode
    entries.push({
      id: `bulbmax:preset:${key.toLowerCase().replace(/:/g, '-')}`,
      label: `${modeLabel} ${lumiplanLine.name}`,
      line: lumiplanLine,
      paths,
    })
  }
}

entries.sort((a, b) => a.label.localeCompare(b.label, 'fr', { numeric: true }))

writeFileSync(OUTPUT, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  presets: entries,
}, null, 2)}\n`)

console.log(`${entries.length} presets écrits dans ${OUTPUT}`)
