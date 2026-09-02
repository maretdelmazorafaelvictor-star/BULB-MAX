import keolis from '~/assets/svg/brands/keolis.svg'
import ratp from '~/assets/svg/brands/ratp_h.png'
import sncf from '~/assets/svg/brands/sncf_voyageurs.svg'
import transdev from '~/assets/svg/brands/transdev.svg'
import { isCustom } from '~/utils/types'

export interface OperatorChoice {
  value: Operator
  label: string
  /** Logo asset URLs, empty when no logo is displayed */
  logos: string[]
}

export const OPERATORS: OperatorChoice[] = [
  { value: 'RATP', label: 'data.operator.ratp', logos: [ratp] },
  { value: 'SNCF', label: 'data.operator.sncf', logos: [sncf] },
  { value: 'RATP_SNCF', label: 'data.operator.ratp_sncf', logos: [ratp, sncf] },
  { value: 'KEOLIS', label: 'data.operator.keolis', logos: [keolis] },
  { value: 'TRANSDEV', label: 'data.operator.transdev', logos: [transdev] },
  { value: 'NONE', label: 'data.operator.none', logos: [] },
]

const SNCF_RER = ['C', 'D', 'E']
const KEOLIS_TRAMS = ['9']
const SNCF_TRAMS = ['4']

/**
 * Exploitant réel de la ligne (Île-de-France), utilisé au chargement d'un preset.
 * L'utilisateur peut toujours le modifier dans les propriétés du plan.
 */
export function defaultOperatorFor(mode: Mode | null, index: LineIndex | null): Operator {
  const builtin = index && !isCustom(index) ? index.$builtinLineIndex.index : null
  switch (mode) {
    case 'BUS':
    case 'BRT':
    case 'NOCTILIEN':
      return 'NONE'
    case 'RER':
      return builtin && SNCF_RER.includes(builtin) ? 'SNCF' : 'RATP_SNCF'
    case 'TRAIN':
      return 'SNCF'
    case 'TRAM':
      if (builtin && KEOLIS_TRAMS.includes(builtin)) return 'KEOLIS'
      return builtin && SNCF_TRAMS.includes(builtin) ? 'SNCF' : 'RATP'
    case 'TRAM_TRAIN':
      return 'SNCF'
    default:
      return 'RATP'
  }
}

export function findOperatorByValue(value: Operator | null): OperatorChoice | null {
  return OPERATORS.find(operator => operator.value === value) ?? null
}
