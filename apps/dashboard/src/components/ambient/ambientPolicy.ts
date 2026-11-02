export interface DashboardAmbientStateParams {
  enabled: boolean
  startHour: number
  endHour: number
  currentTime: Date
  dimAfterLastEvent?: boolean
  hasRemainingEvents?: boolean
  isTemporarilyAwake?: boolean
}

export interface DashboardAmbientState {
  shouldShow: boolean
  isDimmed: boolean
  isNightTime: boolean
  isNoRemainingEvents: boolean
  isEligibleToShow: boolean
}

export function isNightHour(currentHour: number, startHour: number, endHour: number): boolean {
  return startHour > endHour
    ? currentHour >= startHour || currentHour < endHour
    : currentHour >= startHour && currentHour < endHour
}

export function calculateDashboardAmbientState({
  enabled,
  startHour,
  endHour,
  currentTime,
  dimAfterLastEvent = true,
  hasRemainingEvents = true,
  isTemporarilyAwake = false,
}: DashboardAmbientStateParams): DashboardAmbientState {
  if (!enabled) {
    return { shouldShow: false, isDimmed: false, isNightTime: false, isNoRemainingEvents: false, isEligibleToShow: false }
  }

  const isNightTime = isNightHour(currentTime.getHours(), startHour, endHour)
  const isNoRemainingEvents = Boolean(dimAfterLastEvent && !hasRemainingEvents)
  const isEligibleToShow = isNightTime || isNoRemainingEvents
  const shouldShow = isEligibleToShow && !isTemporarilyAwake
  return { shouldShow, isDimmed: shouldShow && isNightTime, isNightTime, isNoRemainingEvents, isEligibleToShow }
}

export function shouldMountDashboardAmbient(shouldShow: boolean, cardsReady: boolean, isExiting: boolean): boolean {
  return Boolean((shouldShow && cardsReady) || isExiting)
}

export function shouldListenForDashboardWake(isEligibleToShow: boolean, isLockScreenShown: boolean): boolean {
  return Boolean(isEligibleToShow && isLockScreenShown)
}

export function shouldHandleDashboardWake(isEligibleToShow: boolean, isLockScreenShown: boolean, isWaking: boolean): boolean {
  return Boolean(isEligibleToShow && isLockScreenShown && !isWaking)
}

export function shouldHideTimelineRadar(isLockScreenShown: boolean, hasLockScreenRadar: boolean): boolean {
  return Boolean(isLockScreenShown && hasLockScreenRadar)
}

export const calculateAmbientState = calculateDashboardAmbientState
export const shouldMountDimmer = shouldMountDashboardAmbient
export const shouldListenForWake = shouldListenForDashboardWake
export const shouldHandleWake = shouldHandleDashboardWake
