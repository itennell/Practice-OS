// Place names the map's area box knows by heart, so a typed neighborhood or
// suburb skips the chat's privacy guard (which reads "Pilsen" as a person's
// name). Only text that isn't on these lists goes through the guard.
//   - Chicago's 77 community areas (City of Chicago, "Boundaries - Community
//     Areas"), plus well-known neighborhoods inside them.
//   - Cook, DuPage, Lake, Will and Kane county suburbs and nearby cities.

const COMMUNITY_AREAS = [
  "Rogers Park", "West Ridge", "Uptown", "Lincoln Square", "North Center", "Lake View", "Lincoln Park", "Near North Side",
  "Edison Park", "Norwood Park", "Jefferson Park", "Forest Glen", "North Park", "Albany Park", "Portage Park", "Irving Park",
  "Dunning", "Montclare", "Belmont Cragin", "Hermosa", "Avondale", "Logan Square", "Humboldt Park", "West Town", "Austin",
  "West Garfield Park", "East Garfield Park", "Near West Side", "North Lawndale", "South Lawndale", "Lower West Side", "Loop",
  "Near South Side", "Armour Square", "Douglas", "Oakland", "Fuller Park", "Grand Boulevard", "Kenwood", "Washington Park",
  "Hyde Park", "Woodlawn", "South Shore", "Chatham", "Avalon Park", "South Chicago", "Burnside", "Calumet Heights", "Roseland",
  "Pullman", "South Deering", "East Side", "West Pullman", "Riverdale", "Hegewisch", "Garfield Ridge", "Archer Heights",
  "Brighton Park", "McKinley Park", "Bridgeport", "New City", "West Elsdon", "Gage Park", "Clearing", "West Lawn",
  "Chicago Lawn", "West Englewood", "Englewood", "Greater Grand Crossing", "Ashburn", "Auburn Gresham", "Beverly",
  "Washington Heights", "Mount Greenwood", "Morgan Park", "O'Hare", "Edgewater",
];

const NEIGHBORHOODS = [
  "Lakeview", "Wrigleyville", "Northalsted", "Boystown", "Roscoe Village", "Ravenswood", "Andersonville", "Bucktown",
  "Wicker Park", "Ukrainian Village", "Noble Square", "East Village", "River West", "West Loop", "Fulton Market", "Greektown",
  "Little Italy", "Tri-Taylor", "University Village", "Pilsen", "Little Village", "Chinatown", "Bronzeville", "South Loop",
  "Printers Row", "Dearborn Park", "Streeterville", "River North", "Gold Coast", "Old Town", "Magnificent Mile", "Cabrini",
  "Sheffield Neighbors", "DePaul", "Ranch Triangle", "Wrightwood", "Budlong Woods", "Sauganash", "Edgebrook", "Mayfair",
  "Old Irving Park", "Ravenswood Manor", "Ukrainian Village", "Kelvyn Park", "Galewood", "Canaryville", "Back of the Yards",
  "Marquette Park", "Jackson Park Highlands", "Grand Crossing", "Bucktown", "Goose Island", "Lakeshore East", "Kenwood",
];

const SUBURBS = [
  "Evanston", "Skokie", "Wilmette", "Winnetka", "Glenview", "Northbrook", "Highland Park", "Lake Forest", "Deerfield",
  "Glencoe", "Kenilworth", "Morton Grove", "Niles", "Park Ridge", "Des Plaines", "Lincolnwood", "Oak Park", "River Forest",
  "Forest Park", "Berwyn", "Cicero", "Oak Lawn", "Evergreen Park", "Blue Island", "Harvey", "Oak Brook", "Elmhurst",
  "Lombard", "Wheaton", "Glen Ellyn", "Downers Grove", "Naperville", "Aurora", "Bolingbrook", "Joliet", "Orland Park",
  "Tinley Park", "Palos Heights", "Palos Park", "La Grange", "Western Springs", "Hinsdale", "Burr Ridge", "Schaumburg",
  "Arlington Heights", "Palatine", "Mount Prospect", "Elk Grove Village", "Hoffman Estates", "Rolling Meadows", "Buffalo Grove",
  "Wheeling", "Vernon Hills", "Libertyville", "Mundelein", "Waukegan", "North Chicago", "Lake Bluff", "Gurnee", "Elgin",
  "St. Charles", "Geneva", "Batavia", "Carol Stream", "Bloomingdale", "Addison", "Villa Park", "Westmont", "Woodridge",
  "Lisle", "Plainfield", "Romeoville", "Lockport", "Homer Glen", "Frankfort", "Mokena", "New Lenox", "Homewood", "Flossmoor",
  "Olympia Fields", "Park Forest", "Chicago Heights", "Calumet City", "Lansing", "Dolton", "South Holland", "Riverside",
  "Brookfield", "Maywood", "Melrose Park", "Franklin Park", "Norridge", "Harwood Heights", "Rosemont", "Bensenville",
  "Wood Dale", "Itasca", "Roselle", "Streamwood", "Bartlett", "Hanover Park", "Glendale Heights", "Darien", "Willowbrook",
  "Countryside", "Hickory Hills", "Bridgeview", "Burbank", "Chicago Ridge", "Worth", "Alsip", "Crestwood", "Midlothian",
  "Oak Forest", "Matteson", "Richton Park", "Lemont", "Justice", "Summit", "Lyons", "McCook", "Hodgkins", "Chicago",
];

const KNOWN = new Set([...COMMUNITY_AREAS, ...NEIGHBORHOODS, ...SUBURBS].map((p) => normalizePlace(p)));

/** Lower case, plain spaces, without a trailing ", Chicago", ", IL" or ", Illinois". */
export function normalizePlace(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(,?\s*(chicago|il|illinois))+$/g, "")
    .replace(/[.,]+$/g, "")
    .trim();
}

/** A neighborhood, community area or suburb on the lists above (so not a person). */
export function isKnownPlace(text: string): boolean {
  const t = normalizePlace(text);
  return t.length > 0 && KNOWN.has(t);
}
