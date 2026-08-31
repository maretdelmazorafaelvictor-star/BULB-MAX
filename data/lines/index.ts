import { AERIAL_TRAMWAY_LINES } from './aerial_tramway'
import { BUS_LINES } from './bus'
import { CHAIRLIFT_LINES } from './chairlift'
import { FUNICULAR_LINES } from './funicular'
import { GONDOLA_LINES } from './gondola'
import { METRO_LINES } from './metro'
import { RER_LINES } from './rer'
import { SKI_LIFT_LINES } from './ski_lift'
import { TRAM_LINES } from './tram'
import { TRAM_TRAIN_LINES } from './tram_train'
import { TRANSILIEN_LINES } from './transilien'
import { VAL_LINES } from './val'

const BUILTIN_LINES: IndexChoice<BuiltinLineIndex>[] = Array.of(
  ...AERIAL_TRAMWAY_LINES,
  ...BUS_LINES,
  ...CHAIRLIFT_LINES,
  ...GONDOLA_LINES,
  ...METRO_LINES,
  ...RER_LINES,
  ...SKI_LIFT_LINES,
  ...TRAM_LINES,
  ...TRANSILIEN_LINES,
  ...FUNICULAR_LINES,
  ...TRAM_TRAIN_LINES,
  ...VAL_LINES,
)

export {
  AERIAL_TRAMWAY_LINES,
  BUILTIN_LINES,
  BUS_LINES,
  CHAIRLIFT_LINES,
  FUNICULAR_LINES,
  GONDOLA_LINES,
  METRO_LINES,
  RER_LINES,
  SKI_LIFT_LINES,
  TRAM_LINES,
  TRAM_TRAIN_LINES,
  TRANSILIEN_LINES,
  VAL_LINES,
}

export function getLinesByMode(mode: Mode | null): IndexChoice<BuiltinLineIndex>[] {
  return BUILTIN_LINES.filter(it => it.value?.mode === mode)
}

export function findLineByValue(index: BuiltinLineIndex): IndexChoice<BuiltinLineIndex> | null {
  return getLinesByMode(index.mode)
    .find(it => it.value.$builtinLineIndex.index === index.$builtinLineIndex.index) ?? null
}
