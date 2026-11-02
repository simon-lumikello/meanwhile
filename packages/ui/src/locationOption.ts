/** The fields a location suggestion shows; weather's `LocationSearchResult` has this shape. */
export interface LocationSearchOption {
  name: string
  admin1?: string
  country?: string
}

/** "Name, Region, Country", skipping missing parts. */
export const formatLocationOption = (option: LocationSearchOption) => [option.name, option.admin1, option.country].filter(Boolean).join(', ')
