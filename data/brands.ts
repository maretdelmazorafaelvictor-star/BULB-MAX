export interface BrandStyleChoice {
  value: BrandStyle
  label: string
}

export const BRAND_STYLES: BrandStyleChoice[] = [
  { value: 'RATP', label: 'data.brand_style.ratp' },
  { value: 'IDFM', label: 'data.brand_style.idfm' },
  { value: 'TCL', label: 'data.brand_style.tcl' },
  { value: 'TUS', label: 'data.brand_style.tus' },
]

export function findBrandStyleByValue(value: BrandStyle | null): BrandStyleChoice | null {
  return BRAND_STYLES.find(brand => brand.value === value) ?? null
}
