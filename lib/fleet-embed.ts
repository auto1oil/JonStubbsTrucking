// The fleet program (One Glovebox: trips, IFTA miles, fuel, receipts,
// maintenance, registrations, repairs, documents) runs inside this app in a
// frame, so drivers use one app. The fleet ID is pasted on Work Orders →
// Setup by an admin; the brand and colour are this app's own.

export const FLEET_ID_KEY = 'oneglovebox_fleet_id';
export const FLEET_ORIGIN = 'https://oneglovebox.com';
export const FLEET_BRAND = 'Jon Stubbs Trucking';
// The accent red from tailwind.config.js, without the '#'.
export const FLEET_COLOR = '8E1414';

export function fleetEmbedUrl(fleetId: string): string {
  const p = new URLSearchParams({ embed: '1', fleet: fleetId.trim(), brand: FLEET_BRAND, color: FLEET_COLOR });
  return `${FLEET_ORIGIN}/app?${p.toString()}`;
}
