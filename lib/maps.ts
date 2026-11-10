// A map link for a typed address. Google's search URL opens the Maps app on
// a phone that has it and the website everywhere else, so one link works
// for a driver on iOS, the office on a Mac, and a hauler on Android.
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}
