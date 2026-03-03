export interface Agency {
  name: string
  short: string
  helpline: string | null
  website: string | null
}

export interface PinResult {
  found: boolean
  city_id: string
  ward_no: number | null
  ward_name: string | null
  zone: string | null
  assembly_constituency: string | null
  agencies: Agency[]
  primary_agency: Agency | null
}

/** Subset of GeoJSON feature properties from datameet BBMP.geojson */
export interface WardProperties {
  KGISWardNo: number
  KGISWardName: string
  ZoneName?: string
  Assembly?: string
}
