import keolis from '~/assets/svg/brands/keolis.svg'
import ratp from '~/assets/svg/brands/ratp_h.png'
import sncf from '~/assets/svg/brands/sncf_voyageurs.svg'
import transdev from '~/assets/svg/brands/transdev.svg'
import { isCustom } from '~/utils/types'

export interface OperatorChoice {
  value: Operator
  label: string
  /** Logo asset URL, null when no logo is displayed */
  logo: string | null
}

export const OPERATORS: OperatorChoice[] = [
  { value: 'RATP', label: 'data.operator.ratp', logo: ratp },
  { value: 'SNCF', label: 'data.operator.sncf', logo: sncf },
  { value: 'KEOLIS', label: 'data.operator.keolis', logo: keolis },
  { value: 'TRANSDEV', label: 'data.operator.transdev', logo: transdev },
  { value: 'NONE', label: 'data.operator.none', logo: null },
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
    case 'RER':
      return builtin && SNCF_RER.includes(builtin) ? 'SNCF' : 'RATP'
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
