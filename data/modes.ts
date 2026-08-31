export const MODES: ModeChoice[] = [
  { value: 'BOAT', label: 'data.mode.boat' },
  { value: 'BRT', label: 'data.mode.brt' },
  { value: 'BUS', label: 'data.mode.bus' },
  { value: 'AERIAL_TRAMWAY', label: 'data.mode.aerial_tramway' },
  { value: 'GONDOLA', label: 'data.mode.gondola' },
  { value: 'CHAIRLIFT', label: 'data.mode.chairlift' },
  { value: 'METRO', label: 'data.mode.metro' },
  { value: 'NOCTILIEN', label: 'data.mode.noctilien' },
  { value: 'RER', label: 'data.mode.rer' },
  { value: 'SKI_LIFT', label: 'data.mode.ski_lift' },
  { value: 'TRAIN', label: 'data.mode.transilien' },
  { value: 'TRAM', label: 'data.mode.tram' },
  { value: 'TRAM_TRAIN', label: 'data.mode.tram_train' },
  { value: 'FUNICULAR', label: 'data.mode.funicular' },
  { value: 'VAL', label: 'data.mode.val' },
  { value: 'VELO', label: 'data.mode.bike' },
]

export function findModeByValue(value: Mode | null): ModeChoice | null {
  return MODES.find(mode => mode.value === value) ?? null
}

export function modeToShape(mode: Mode): IndexShape {
  switch (mode) {
    case 'METRO':
    case 'VAL':
      return 'CIRCLE'
    case 'RER':
    case 'TRAIN':
    case 'TRAIN_RER':
      return 'ROUNDED_SQUARE'
    case 'BOAT':
    case 'AERIAL_TRAMWAY':
    case 'BRT':
    case 'GONDOLA':
    case 'CHAIRLIFT':
    case 'SKI_LIFT':
    case 'VELO':
    case 'TRAM':
    case 'TRAM_TRAIN':
    case 'FUNICULAR':
      return 'LINES'
    case 'BUS':
      return 'RECTANGLE'
    case 'NOCTILIEN':
      return 'CUT_RECTANGLE'
  }
}
