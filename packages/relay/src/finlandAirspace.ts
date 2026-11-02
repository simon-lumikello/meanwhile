import type { AircraftRegion } from './aircraft.ts'

/**
 * Finland's land territory and territorial waters, including Åland, as a coarse
 * outline (accurate to roughly ten kilometres). Two of the widest upstream
 * searches cover it: one centred on the south, one on Lapland.
 */
export const FINLAND_AIRSPACE: AircraftRegion = {
  searches: [
    { lat: 61.6, lon: 24.9, radiusNm: 250 },
    { lat: 67.3, lon: 25.8, radiusNm: 250 },
  ],
  outline: [
    // Swedish border along the Tornio, Muonio and Könkämä rivers.
    [65.8, 24.15], [66.3, 23.65], [66.8, 23.9], [67.35, 23.75], [67.95, 23.55], [68.45, 22.45], [69.06, 20.55],
    // Norwegian border: the Halti arm, the Anarjohka and the Tana.
    [69.31, 21.27], [68.66, 23.4], [68.8, 24.9], [69.4, 25.85], [69.91, 27.03], [70.09, 27.9], [69.95, 28.4], [69.7, 29.3],
    // Russian border, from the Treriksrøysa tripoint to the Gulf of Finland.
    [69.05, 28.93], [68.48, 28.35], [68.07, 29.33], [67.55, 29.85], [66.9, 29.35], [66.35, 29.6], [65.9, 29.95],
    [64.52, 30.1], [64.05, 30.55], [63.3, 31.25], [62.91, 31.59], [62.2, 30.65], [61.57, 29.72], [61.2, 28.85],
    [60.96, 28.55], [60.57, 27.82], [60.45, 27.75],
    // Territorial waters: the Gulf of Finland, the Archipelago Sea and Åland.
    [60.2, 27.3], [60.05, 26.7], [59.9, 25.8], [59.83, 24.8], [59.62, 23.4], [59.52, 22.4], [59.57, 21.3],
    [59.68, 20.3], [59.85, 19.45], [60.3, 19.13], [60.75, 19.8],
    // Territorial waters: the Bothnian Sea, the Kvarken and the Bothnian Bay.
    [61.0, 20.7], [61.6, 20.95], [62.3, 20.65], [63.0, 20.5], [63.5, 20.9], [63.9, 21.9], [64.4, 23.35],
    [65.0, 24.05], [65.5, 24.1],
  ],
}
