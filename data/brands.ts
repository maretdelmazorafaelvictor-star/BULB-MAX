export interface BrandStyleChoice {
  value: BrandStyle
  label: string
  /** Suffix shown in the map footer, e.g. "BULB-Paris" */
  footer: string
}

export const BRAND_STYLES: BrandStyleChoice[] = [
  { value: 'RATP', label: 'data.brand_style.ratp', footer: 'Paris' },
  { value: 'IDFM', label: 'data.brand_style.idfm', footer: 'IDFM' },
  { value: 'SNCF', label: 'data.brand_style.sncf', footer: 'SNCF' },
  { value: 'SNCF_D', label: 'data.brand_style.sncf_d', footer: 'SNCF' },
]

export function findBrandStyleByValue(value: BrandStyle | null): BrandStyleChoice | null {
  return BRAND_STYLES.find(brand => brand.value === value) ?? null
}
