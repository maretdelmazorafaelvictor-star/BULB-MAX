import {
  JAUNE_OCRE,
  MARON,
  ORANGE,
  ROUGE_FRAMBOISE,
  TURQUOISE,
} from '~/data/colors'

export const TRAM_TRAIN_LINES: IndexChoice<BuiltinLineIndex>[] = [
  { value: { mode: 'TRAM_TRAIN', $builtinLineIndex: { index: '4' } }, label: 'tram-train T4', color: JAUNE_OCRE.value },
  { value: { mode: 'TRAM_TRAIN', $builtinLineIndex: { index: '11' } }, label: 'tram-train T11', color: ORANGE.value },
  { value: { mode: 'TRAM_TRAIN', $builtinLineIndex: { index: '12' } }, label: 'tram-train T12', color: ROUGE_FRAMBOISE.value },
  { value: { mode: 'TRAM_TRAIN', $builtinLineIndex: { index: '13' } }, label: 'tram-train T13', color: MARON.value },
  { value: { mode: 'TRAM_TRAIN', $builtinLineIndex: { index: '14' } }, label: 'tram-train T14', color: TURQUOISE.value },
]
