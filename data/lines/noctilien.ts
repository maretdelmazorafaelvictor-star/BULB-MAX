import { MAGENTA, ROUGE_COQUELICOT } from '~/data/colors'

export const NOCTILIEN_LINES: IndexChoice<BuiltinLineIndex>[] = [
  { value: { mode: 'NOCTILIEN', $builtinLineIndex: { index: 'N01' } }, label: 'N01', color: MAGENTA.value },
  { value: { mode: 'NOCTILIEN', $builtinLineIndex: { index: 'N02' } }, label: 'N02', color: ROUGE_COQUELICOT.value },
]
