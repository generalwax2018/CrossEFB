import type { Airport } from "./types";
import generatedRows from "./us-airports.json";

const A = (
  icao: string,
  name: string,
  city: string,
  lat: number,
  lon: number,
  elev: number,
  cls: Airport["cls"],
  ring: boolean,
  rwy: string,
  freq: string,
  varE: number,
  hdg?: number,
): Airport => ({ icao, name, city, lat, lon, elev, cls, ring, rwy, freq, varE, hdg });

const HAND: Airport[] = [
  A("KDEN", "Denver Intl", "Denver", 39.8561, -104.6737, 5434, "B", true, "16R/34L 12,000 ft", "133.30", 8, 170),
  A("KAPA", "Centennial", "Englewood", 39.5701, -104.8493, 5885, "D", true, "17L/35R 10,001 ft", "118.90", 8, 170),
  A("KBJC", "Rocky Mountain Metro", "Broomfield", 39.9088, -105.1172, 5673, "D", true, "12L/30R 9,000 ft", "118.60", 8, 120),
  A("KFTG", "Colorado Air and Space Port", "Watkins", 39.7853, -104.5431, 5512, "D", true, "17/35 8,000 ft", "120.35", 8, 170),
  A("KEIK", "Erie Municipal", "Erie", 40.0103, -105.048, 5130, "E", false, "15/33 4,700 ft", "122.70", 8, 150),
  A("KLMO", "Vance Brand", "Longmont", 40.1642, -105.1636, 5055, "E", false, "11/29 4,800 ft", "122.80", 8, 110),
  A("KBDU", "Boulder Municipal", "Boulder", 40.0394, -105.2257, 5288, "E", false, "08/26 4,100 ft", "123.00", 8, 80),
  A("KFNL", "Northern Colorado Regional", "Loveland", 40.4518, -105.0112, 5016, "D", true, "15/33 8,500 ft", "118.40", 8, 150),
  A("KGXY", "Greeley-Weld County", "Greeley", 40.4374, -104.6332, 4657, "D", true, "17/35 10,000 ft", "118.80", 8, 170),
  A("KCOS", "City of Colorado Springs", "Colorado Springs", 38.8058, -104.7008, 6187, "C", true, "17L/35R 13,501 ft", "119.90", 8, 170),
  A("KFLY", "Meadow Lake", "Colorado Springs", 38.9457, -104.5699, 6874, "E", false, "15/33 6,000 ft", "122.70", 8, 150),
  A("KPUB", "Pueblo Memorial", "Pueblo", 38.2891, -104.4965, 4726, "D", true, "08L/26R 10,496 ft", "119.10", 8, 80),
  A("KASE", "Aspen/Pitkin County", "Aspen", 39.2232, -106.8689, 7838, "D", true, "15/33 8,006 ft", "118.85", 9, 150),
  A("KEGE", "Eagle County Regional", "Eagle", 39.6426, -106.9177, 6540, "D", true, "07/25 9,000 ft", "119.80", 9, 70),
  A("KRIL", "Rifle Garfield County", "Rifle", 39.5265, -107.7268, 5544, "E", false, "08/26 7,000 ft", "122.80", 10, 80),
  A("KGJT", "Grand Junction Regional", "Grand Junction", 39.1224, -108.5267, 4858, "D", true, "11/29 10,501 ft", "118.10", 10, 110),
  A("KMTJ", "Montrose Regional", "Montrose", 38.5098, -107.8942, 5759, "D", true, "17/35 10,000 ft", "118.50", 9, 170),
  A("KTEX", "Telluride Regional", "Telluride", 37.9538, -107.9085, 9070, "E", false, "09/27 7,111 ft", "122.80", 9, 90),
  A("KGUC", "Gunnison-Crested Butte", "Gunnison", 38.5339, -106.933, 7680, "E", false, "06/24 9,400 ft", "122.80", 9, 60),
  A("KLXV", "Lake County", "Leadville", 39.2203, -106.3168, 9927, "E", false, "16/34 6,400 ft", "122.70", 9, 160),
  A("KHDN", "Yampa Valley", "Hayden", 40.4812, -107.2177, 6602, "D", true, "10/28 10,000 ft", "118.25", 9, 100),
  A("KSBS", "Steamboat Springs", "Steamboat Springs", 40.5163, -106.8661, 6882, "E", false, "14/32 4,452 ft", "122.80", 9, 140),
  A("KDRO", "Durango-La Plata", "Durango", 37.1515, -107.754, 6685, "D", true, "03/21 9,201 ft", "120.35", 9, 30),
  A("KALS", "San Luis Valley Regional", "Alamosa", 37.4349, -105.8666, 7539, "E", false, "02/20 8,519 ft", "122.80", 8, 20),
  A("KCEZ", "Cortez Municipal", "Cortez", 37.303, -108.6281, 5918, "E", false, "03/21 7,205 ft", "122.80", 10, 30),
  A("KCYS", "Cheyenne Regional", "Cheyenne", 41.1556, -104.8118, 6159, "D", true, "09/27 9,267 ft", "118.70", 8, 90),
  A("KLAR", "Laramie Regional", "Laramie", 41.3121, -105.675, 7278, "E", false, "12/30 8,500 ft", "122.80", 9, 120),
  A("KCPR", "Casper/Natrona County", "Casper", 42.908, -106.4644, 5350, "C", true, "03/21 10,165 ft", "118.30", 9, 30),
  A("KBIL", "Billings Logan Intl", "Billings", 45.8077, -108.5429, 3652, "C", true, "10L/28R 10,518 ft", "119.40", 11, 100),
  A("KBZN", "Bozeman Yellowstone Intl", "Bozeman", 45.7776, -111.1529, 4473, "D", true, "12/30 8,994 ft", "118.20", 12, 120),
  A("KGPI", "Glacier Park Intl", "Kalispell", 48.3105, -114.256, 2977, "D", true, "02/20 9,007 ft", "124.55", 13, 20),
  A("KSLC", "Salt Lake City Intl", "Salt Lake City", 40.7884, -111.9778, 4227, "B", true, "16L/34R 12,002 ft", "118.30", 11, 160),
  A("KPVU", "Provo Municipal", "Provo", 40.2192, -111.7234, 4497, "D", true, "13/31 8,600 ft", "118.20", 11, 130),
  A("KOGD", "Ogden-Hinckley", "Ogden", 41.196, -112.0122, 4473, "D", true, "03/21 8,103 ft", "118.70", 11, 30),
  A("KBOI", "Boise Air Terminal", "Boise", 43.5644, -116.2228, 2871, "C", true, "10R/28L 10,000 ft", "118.10", 13, 100),
  A("KJAC", "Jackson Hole", "Jackson", 43.6073, -110.7377, 6451, "D", true, "01/19 6,300 ft", "118.07", 11, 10),
  A("KLAS", "Harry Reid Intl", "Las Vegas", 36.0801, -115.1523, 2181, "B", true, "08L/26R 14,515 ft", "119.90", 11, 80),
  A("KVGT", "North Las Vegas", "Las Vegas", 36.2107, -115.1944, 2205, "D", true, "07/25 5,005 ft", "120.90", 11, 70),
  A("KHND", "Henderson Executive", "Henderson", 35.9728, -115.1344, 2492, "D", true, "17R/35L 6,501 ft", "125.10", 11, 170),
  A("KPHX", "Phoenix Sky Harbor Intl", "Phoenix", 33.4373, -112.0078, 1135, "B", true, "08/26 11,489 ft", "120.90", 11, 80),
  A("KSDL", "Scottsdale", "Scottsdale", 33.6229, -111.9105, 1510, "D", true, "03/21 8,249 ft", "119.90", 11, 30),
  A("KDVT", "Phoenix Deer Valley", "Phoenix", 33.6883, -112.0825, 1478, "D", true, "07R/25L 8,196 ft", "118.40", 11, 70),
  A("KTUS", "Tucson Intl", "Tucson", 32.1161, -110.941, 2643, "C", true, "11L/29R 10,996 ft", "118.30", 10, 110),
  A("KABQ", "Albuquerque Intl Sunport", "Albuquerque", 35.0402, -106.6092, 5355, "C", true, "08/26 13,793 ft", "120.30", 9, 80),
  A("KSAF", "Santa Fe Regional", "Santa Fe", 35.6171, -106.0894, 6348, "D", true, "02/20 8,366 ft", "119.50", 9, 20),
  A("KLAX", "Los Angeles Intl", "Los Angeles", 33.9425, -118.4081, 128, "B", true, "07L/25R 12,923 ft", "120.95", 12, 70),
  A("KBUR", "Hollywood Burbank", "Burbank", 34.2007, -118.3585, 778, "C", true, "08/26 6,886 ft", "118.70", 12, 80),
  A("KSNA", "John Wayne", "Santa Ana", 33.6757, -117.8682, 56, "C", true, "02L/20R 5,701 ft", "126.80", 12, 20),
  A("KSAN", "San Diego Intl", "San Diego", 32.7336, -117.1897, 17, "B", true, "09/27 9,401 ft", "118.30", 11, 90),
  A("KSFO", "San Francisco Intl", "San Francisco", 37.6213, -122.379, 13, "B", true, "10L/28R 11,870 ft", "120.50", 13, 100),
  A("KOAK", "San Francisco Bay Oakland", "Oakland", 37.7213, -122.2208, 9, "C", true, "12/30 10,520 ft", "118.30", 13, 120),
  A("KSJC", "Norman Y. Mineta San Jose", "San Jose", 37.3626, -121.9291, 62, "C", true, "12L/30R 11,000 ft", "124.00", 13, 120),
  A("KSMF", "Sacramento Intl", "Sacramento", 38.6954, -121.5908, 27, "C", true, "16L/34R 8,600 ft", "125.25", 13, 160),
  A("KRNO", "Reno-Tahoe Intl", "Reno", 39.4991, -119.7681, 4415, "C", true, "16R/34L 11,001 ft", "118.70", 13, 160),
  A("KSEA", "Seattle-Tacoma Intl", "Seattle", 47.4502, -122.3088, 433, "B", true, "16L/34R 11,901 ft", "119.90", 15, 160),
  A("KPDX", "Portland Intl", "Portland", 45.5898, -122.5951, 31, "C", true, "10R/28L 11,000 ft", "118.70", 15, 100),
  A("KGEG", "Spokane Intl", "Spokane", 47.6199, -117.5338, 2376, "C", true, "03/21 11,002 ft", "118.30", 14, 30),
  A("KDFW", "Dallas/Fort Worth Intl", "Dallas", 32.8998, -97.0403, 607, "B", true, "17C/35C 13,401 ft", "124.15", 3, 170),
  A("KDAL", "Dallas Love Field", "Dallas", 32.8471, -96.8518, 487, "D", false, "13L/31R 8,800 ft", "120.15", 3, 130),
  A("KAUS", "Austin-Bergstrom Intl", "Austin", 30.1945, -97.6699, 542, "C", true, "18L/36R 12,250 ft", "121.00", 4, 180),
  A("KSAT", "San Antonio Intl", "San Antonio", 29.5337, -98.4698, 809, "C", true, "13R/31L 8,505 ft", "118.90", 4, 130),
  A("KIAH", "George Bush Intercontinental", "Houston", 29.9844, -95.3414, 97, "B", true, "15L/33R 12,001 ft", "127.30", 3, 150),
  A("KHOU", "William P. Hobby", "Houston", 29.6454, -95.2789, 46, "C", true, "13R/31L 7,602 ft", "118.70", 3, 130),
  A("KORD", "Chicago O'Hare Intl", "Chicago", 41.9742, -87.9073, 680, "B", true, "10L/28R 13,000 ft", "120.75", -3, 100),
  A("KMDW", "Chicago Midway Intl", "Chicago", 41.7868, -87.7522, 620, "C", true, "13C/31C 6,522 ft", "118.70", -3, 130),
  A("KMKE", "Milwaukee Mitchell Intl", "Milwaukee", 42.9472, -87.8966, 723, "C", true, "01L/19R 9,690 ft", "125.05", -3, 10),
  A("KMSP", "Minneapolis-St Paul Intl", "Minneapolis", 44.882, -93.2218, 841, "B", true, "12R/30L 10,000 ft", "123.80", 1, 120),
  A("KMCI", "Kansas City Intl", "Kansas City", 39.2976, -94.7139, 1026, "B", true, "01L/19R 10,801 ft", "118.40", 2, 10),
  A("KSTL", "St. Louis Lambert Intl", "St. Louis", 38.7487, -90.37, 618, "B", true, "12R/30L 11,019 ft", "120.05", 0, 120),
  A("KDTW", "Detroit Metro Wayne County", "Detroit", 42.2124, -83.3534, 645, "B", true, "04R/22L 12,003 ft", "118.40", -7, 40),
  A("KATL", "Hartsfield-Jackson Atlanta", "Atlanta", 33.6407, -84.4277, 1026, "B", true, "08L/26R 12,390 ft", "119.10", -5, 80),
  A("KCLT", "Charlotte Douglas Intl", "Charlotte", 35.214, -80.9431, 748, "B", true, "18C/36C 10,000 ft", "126.40", -8, 180),
  A("KBNA", "Nashville Intl", "Nashville", 36.1263, -86.6774, 599, "C", true, "02L/20R 8,000 ft", "118.60", -4, 20),
  A("KMEM", "Memphis Intl", "Memphis", 35.0424, -89.9767, 341, "B", true, "18C/36C 11,120 ft", "118.30", -2, 180),
  A("KJFK", "John F Kennedy Intl", "New York", 40.6413, -73.7781, 13, "B", true, "13L/31R 14,511 ft", "119.10", -13, 130),
  A("KLGA", "LaGuardia", "New York", 40.7772, -73.8726, 21, "D", false, "13/31 7,003 ft", "118.70", -13, 130),
  A("KEWR", "Newark Liberty Intl", "Newark", 40.6895, -74.1745, 18, "D", false, "04R/22L 11,000 ft", "118.30", -13, 40),
  A("KBOS", "Boston Logan Intl", "Boston", 42.3656, -71.0096, 20, "B", true, "04R/22L 10,005 ft", "128.80", -14, 40),
  A("KMIA", "Miami Intl", "Miami", 25.7959, -80.287, 8, "B", true, "08R/26L 13,016 ft", "118.30", -6, 80),
  A("KFLL", "Fort Lauderdale-Hollywood", "Fort Lauderdale", 26.0726, -80.1527, 65, "C", true, "10L/28R 9,000 ft", "119.30", -6, 100),
  A("KMCO", "Orlando Intl", "Orlando", 28.4294, -81.309, 96, "B", true, "17L/35R 12,005 ft", "124.30", -6, 170),
  A("KTPA", "Tampa Intl", "Tampa", 27.9755, -82.5332, 26, "B", true, "01L/19R 11,002 ft", "119.50", -5, 10),
  A("KIAD", "Washington Dulles Intl", "Dulles", 38.9531, -77.4565, 312, "B", true, "01R/19L 11,500 ft", "120.45", -11, 10),
  A("KDCA", "Ronald Reagan Washington", "Washington", 38.8521, -77.0377, 15, "D", false, "01/19 7,169 ft", "119.10", -11, 10),
  A("KBWI", "Baltimore/Washington Intl", "Baltimore", 39.1754, -76.6683, 146, "C", true, "10/28 10,502 ft", "119.40", -11, 100),
  A("KRDM", "Roberts Field", "Redmond", 44.2541, -121.15, 3082, "D", true, "05/23 7,038 ft", "124.50", 14, 50),
  A("KBDN", "Bend Municipal", "Bend", 44.0946, -121.2002, 3459, "E", false, "17/35 5,201 ft", "123.00", 14, 170),
];

type GenRow = [
  string,
  string,
  string,
  number,
  number,
  number,
  Airport["cls"],
  0 | 1,
  string,
  string,
  number,
  number | null,
  string,
  string,
];

function fromGenerated(row: GenRow): Airport {
  const airport: Airport = {
    icao: row[0],
    name: row[1],
    city: row[2],
    lat: row[3],
    lon: row[4],
    elev: row[5],
    cls: row[6],
    ring: row[7] === 1,
    rwy: row[8],
    freq: row[9],
    varE: row[10],
  };
  if (row[11] != null) airport.hdg = row[11];
  if (row[12]) airport.lid = row[12];
  if (row[13]) airport.iata = row[13];
  return airport;
}

const handByIcao = new Map(HAND.map((a) => [a.icao, a]));
const merged: Airport[] = [];
const seen = new Set<string>();
for (const row of generatedRows as GenRow[]) {
  const generated = fromGenerated(row);
  merged.push(handByIcao.get(generated.icao) ?? generated);
  seen.add(generated.icao);
}
for (const airport of HAND) {
  if (!seen.has(airport.icao)) merged.push(airport);
}
merged.sort((a, b) => a.icao.localeCompare(b.icao));

export const AIRPORTS: Airport[] = merged;

const BY_ICAO = new Map(AIRPORTS.map((a) => [a.icao, a]));
const CELL = new Map<string, Airport[]>();
for (const airport of AIRPORTS) {
  const key = `${Math.floor(airport.lat)}:${Math.floor(airport.lon)}`;
  const list = CELL.get(key);
  if (list) list.push(airport);
  else CELL.set(key, [airport]);
}

export function getAirport(icao: string): Airport | undefined {
  return BY_ICAO.get(icao.toUpperCase());
}

function codes(airport: Airport): string[] {
  const id = airport.icao;
  const short = id.startsWith("K") && id.length === 4 ? id.slice(1) : id;
  const out = short === id ? [id] : [id, short];
  if (airport.lid && !out.includes(airport.lid)) out.push(airport.lid);
  if (airport.iata && !out.includes(airport.iata)) out.push(airport.iata);
  return out;
}

export function searchAirports(q: string): Airport[] {
  const s = q.trim().toUpperCase();
  if (!s) return [];
  const scored: { a: Airport; score: number }[] = [];
  for (const airport of AIRPORTS) {
    const idents = codes(airport);
    let score = 0;
    if (idents.some((id) => id === s)) score = 100;
    else if (idents.some((id) => id.startsWith(s))) score = 80;
    else if (airport.city.toUpperCase().startsWith(s)) score = 60;
    else if (s.length >= 4 && (airport.name.toUpperCase().includes(s) || airport.city.toUpperCase().includes(s))) score = 40;
    if (score) scored.push({ a: airport, score });
  }
  scored.sort((x, y) => y.score - x.score || x.a.icao.localeCompare(y.a.icao));
  return scored.slice(0, 8).map((x) => x.a);
}

export function airportsNear(lat: number, lon: number, latSpan: number, lonSpan: number, padDeg = 0.7): Airport[] {
  const lat0 = Math.floor(lat - latSpan / 2 - padDeg);
  const lat1 = Math.floor(lat + latSpan / 2 + padDeg);
  const lon0 = Math.floor(lon - lonSpan / 2 - padDeg);
  const lon1 = Math.floor(lon + lonSpan / 2 + padDeg);
  if (lat1 - lat0 > 70 || lon1 - lon0 > 140) return AIRPORTS;
  const out: Airport[] = [];
  for (let la = lat0; la <= lat1; la++) {
    for (let lo = lon0; lo <= lon1; lo++) {
      const cell = CELL.get(`${la}:${lo}`);
      if (cell) out.push(...cell);
    }
  }
  return out;
}

export const PRESETS: { name: string; ids: string[] }[] = [
  { name: "Denver training loop", ids: ["KAPA", "KBJC", "KLMO", "KEIK"] },
  { name: "Front Range south", ids: ["KAPA", "KCOS", "KPUB"] },
  { name: "Into the mountains", ids: ["KAPA", "KEGE", "KASE"] },
  { name: "High and hot", ids: ["KAPA", "KLXV", "KGUC"] },
  { name: "Central Oregon", ids: ["KRDM", "KBDN", "KS21"] },
];

export function ringsNm(a: Airport): number[] {
  if (!a.ring) return [];
  if (a.cls === "B") return [10, 20, 30];
  if (a.cls === "C") return [5, 10];
  if (a.cls === "D") return [4.3];
  return [];
}
