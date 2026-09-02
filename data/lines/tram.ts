import {
  BLEU_FONCE,
  BLEU_OUTREMER,
  MAGENTA,
  MARON,
  OLIVE_FONCE,
  ORANGE,
  ROUGE_COQUELICOT,
  VERT_FONCE,
  VIOLET,
} from '~/data/colors'

export const TRAM_LINES: IndexChoice<BuiltinLineIndex>[] = [
  { value: { mode: 'TRAM', $builtinLineIndex: { index: '1' } }, label: 'Tramway T1', color: BLEU_FONCE.value },
  { value: { mode: 'TRAM', $builtinLineIndex: { index: '2' } }, label: 'Tramway T2', color: MAGENTA.value },
  { value: { mode: 'TRAM', $builtinLineIndex: { index: '3a' } }, label: 'Tramway T3a', color: ORANGE.value },
  { value: { mode: 'TRAM', $builtinLineIndex: { index: '3b' } }, label: 'Tramway T3b', color: VERT_FONCE.value },
  { value: { mode: 'TRAM', $builtinLineIndex: { index: '5' } }, label: 'Tramway T5', color: VIOLET.value },
  { value: { mode: 'TRAM', $builtinLineIndex: { index: '6' } }, label: 'Tramway T6', color: ROUGE_COQUELICOT.value },
  { value: { mode: 'TRAM', $builtinLineIndex: { index: '7' } }, label: 'Tramway T7', color: MARON.value },
  { value: { mode: 'TRAM', $builtinLineIndex: { index: '8' } }, label: 'Tramway T8', color: OLIVE_FONCE.value },
  { value: { mode: 'TRAM', $builtinLineIndex: { index: '9' } }, label: 'Tramway T9', color: BLEU_OUTREMER.value },
  { value: { mode: 'TRAM', $builtinLineIndex: { index: '10' } }, label: 'Tramway T10', color: OLIVE_FONCE.value },
]
