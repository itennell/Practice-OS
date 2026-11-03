// Key prefixes of the rows lib/referrals/sources/stored-cache.ts keeps in
// practice_os.referral_fetch_cache. They have their own lifetimes (and their own
// prune), so the website-page prune in lib/referrals/email/fetch.ts leaves them alone.
// Its own small file so that prune can read it without loading the NPPES or geocoder code.

export const NPPES_KEY_PREFIX = "https://npiregistry.cms.hhs.gov/api/?";
export const CENSUS_KEY_PREFIX = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch#address=";
export const STORED_KEY_PREFIXES = [NPPES_KEY_PREFIX, CENSUS_KEY_PREFIX] as const;
