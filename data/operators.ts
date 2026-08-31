import keolis from '~/assets/svg/brands/keolis.svg'
import ratp from '~/assets/svg/brands/ratp.svg'
import sncf from '~/assets/svg/brands/sncf_voyageurs.svg'
import transdev from '~/assets/svg/brands/transdev.svg'

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

export function findOperatorByValue(value: Operator | null): OperatorChoice | null {
  return OPERATORS.find(operator => operator.value === value) ?? null
}
