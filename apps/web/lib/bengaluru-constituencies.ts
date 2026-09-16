const DATA_NAME_BY_KEY: Record<string, string> = {
  btmlayout: "BTM Layout",
  chamrajpet: "Chamrajpet",
  cvramannagar: "C V Raman Nagar",
  gandhinagar: "Gandhi Nagar",
  govindarajanagar: "Govindaraja Nagar",
  krpuram: "K R Puram",
  padmanabhanagar: "Padmanabhanagar",
  rajarajeshwarinagar: "Rajarajeshwari Nagar",
  sarvajnanagar: "Sarvajnanagar",
  shantinagar: "Shanti Nagar",
  yeshvanthapura: "Yeshvanthapura",
}

export function constituencyKey(value: string | null | undefined): string {
  const key = String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
  const aliases: Record<string, string> = {
    chamrajapet: "chamrajpet",
    gandhinagara: "gandhinagar",
    govindrajnagar: "govindarajanagar",
    krpura: "krpuram",
    padmanabanagar: "padmanabhanagar",
    sarvagnanagar: "sarvajnanagar",
    shanthinagar: "shantinagar",
    yeshwanthapura: "yeshvanthapura",
  }
  return aliases[key] ?? key
}

export function bengaluruDataConstituency(value: string): string {
  return DATA_NAME_BY_KEY[constituencyKey(value)] ?? value
}
