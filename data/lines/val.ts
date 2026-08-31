import {
 ORANGE,
 BLEU_CLAIR,   
} from '~/data/colors'

export const VAL_LINES: IndexChoice<BuiltinLineIndex>[] = [
  { value: { mode: 'VAL', $builtinLineIndex: { index: 'CDGVAL' } }, label: 'CDGVAL', color: ORANGE.value },
  { value: { mode: 'VAL', $builtinLineIndex: { index: 'ORLYVAL' } }, label: 'OrlyVal', color: BLEU_CLAIR.value },
]
