export function modeToLineThickness(mode: Mode): string {
  switch (mode) {
    case 'BOAT':
    case 'BRT':
    case 'BUS':
    case 'METRO':
    case 'VAL':
    case 'VELO':
      return '0.375'
    case 'AERIAL_TRAMWAY':
    case 'CHAIRLIFT':
    case 'FUNICULAR':
    case 'GONDOLA':
    case 'SKI_LIFT':
    case 'TRAM':
      return '0.625'
    case 'TRAM_TRAIN':
      return '0.8'
    case 'RER':
    case 'TRAIN':
    case 'TRAIN_RER':
      return '1.5'
    default:
      return '0.375'
  }
}

export function modeToLineStyle(mode: Mode): LineStyle {
  switch (mode) {
    case 'AERIAL_TRAMWAY':
    case 'CHAIRLIFT':
    case 'GONDOLA':
    case 'SKI_LIFT':
    case 'TRAM':
    case 'TRAM_TRAIN':
      return 'STRIPED'
    default:
      return 'PLAIN'
  }
}

export function modeToDotsColorPolicy(mode: Mode): DotsColorPolicy {
  switch (mode) {
    case 'RER':
    case 'TRAIN':
    case 'TRAIN_RER':
    case 'TRAM_TRAIN':
      return 'WHITE'
    default:
      return 'INHERIT'
  }
}

export function modeToTerminusFramePolicy(mode: Mode): boolean {
  switch (mode) {
    case 'RER':
    case 'TRAIN':
      return false
    default:
      return true
  }
}
