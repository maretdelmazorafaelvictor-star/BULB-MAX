import { JAUNE_OCRE, ROSE, JAUNE_VIF, MAGENTA, ORANGE, ROUGE_COQUELICOT, VERT_FONCE, VERT_CLAIR, OLIVE_CLAIR, BLEU_OUTREMER, ROUGE_FRAMBOISE, LILAS, MARON, OLIVE_FONCE, VIOLET } from '~/data/colors'

export const NOCTILIEN_LINES: IndexChoice<BuiltinLineIndex>[] = [
  { value: { mode: 'NOCTILIEN', $builtinLineIndex: { index: 'N01' } }, label: 'N01', color: MAGENTA.value },
  { value: { mode: 'NOCTILIEN', $builtinLineIndex: { index: 'N02' } }, label: 'N02', color: ROUGE_COQUELICOT.value }
]
