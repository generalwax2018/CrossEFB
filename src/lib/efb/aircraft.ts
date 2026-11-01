import type { Aircraft, Station } from "./types";

const seats = (rows: [string, string, number, boolean][]): Station[] =>
  rows.map(([id, name, arm, seat]) => ({ id, name, arm, seat }));

export const PROFILES: Aircraft[] = [
  {
    profileId: "c172s",
    name: "Cessna 172S",
    tail: "N172EF",
    color: "white / blue",
    tas: 110,
    burnGph: 8.5,
    usableGal: 50,
    cruiseFt: 9500,
    bew: 1663,
    beArm: 40.6,
    fuelArm: 48,
    mgw: 2550,
    stations: seats([
      ["pilot", "Pilot", 37, true],
      ["copilot", "Front seat", 37, true],
      ["rear", "Rear seats", 73, true],
      ["bags", "Baggage", 95, false],
    ]),
    fwd: [
      { lb: 1500, arm: 35 },
      { lb: 2550, arm: 41 },
    ],
    aft: [
      { lb: 1500, arm: 47.3 },
      { lb: 2550, arm: 47.3 },
    ],
    toRoll: 1000,
    to50: 1700,
    ldgRoll: 600,
    ldg50: 1300,
    refLb: 2550,
    liftoffKt: 55,
    approachKt: 65,
  },
  {
    profileId: "c182",
    name: "Cessna 182T",
    tail: "N182EF",
    color: "white / red",
    tas: 140,
    burnGph: 13,
    usableGal: 87,
    cruiseFt: 9500,
    bew: 1970,
    beArm: 38.5,
    fuelArm: 46,
    mgw: 3100,
    stations: seats([
      ["pilot", "Pilot", 37, true],
      ["copilot", "Front seat", 37, true],
      ["rear", "Rear seats", 74, true],
      ["bags", "Baggage", 97, false],
    ]),
    fwd: [
      { lb: 2200, arm: 33 },
      { lb: 3100, arm: 40.9 },
    ],
    aft: [
      { lb: 2200, arm: 48.5 },
      { lb: 3100, arm: 48.5 },
    ],
    toRoll: 800,
    to50: 1500,
    ldgRoll: 600,
    ldg50: 1400,
    refLb: 3100,
    liftoffKt: 60,
    approachKt: 70,
  },
  {
    profileId: "pa28",
    name: "Piper PA-28-181",
    tail: "N28EF",
    color: "white / green",
    tas: 120,
    burnGph: 10,
    usableGal: 48,
    cruiseFt: 7500,
    bew: 1550,
    beArm: 87,
    fuelArm: 95,
    mgw: 2550,
    stations: seats([
      ["pilot", "Pilot", 80.5, true],
      ["copilot", "Front seat", 80.5, true],
      ["rear", "Rear seats", 118, true],
      ["bags", "Baggage", 142.8, false],
    ]),
    fwd: [
      { lb: 1650, arm: 80.7 },
      { lb: 2550, arm: 87 },
    ],
    aft: [
      { lb: 1650, arm: 93 },
      { lb: 2550, arm: 93 },
    ],
    toRoll: 900,
    to50: 1600,
    ldgRoll: 600,
    ldg50: 1200,
    refLb: 2550,
    liftoffKt: 60,
    approachKt: 70,
  },
  {
    profileId: "sr22",
    name: "Cirrus SR22",
    tail: "N22EF",
    color: "white / gray",
    tas: 170,
    burnGph: 16,
    usableGal: 81,
    cruiseFt: 9500,
    bew: 2300,
    beArm: 140,
    fuelArm: 154,
    mgw: 3400,
    stations: seats([
      ["pilot", "Pilot", 143, true],
      ["copilot", "Front seat", 143, true],
      ["rear", "Rear seats", 180, true],
      ["bags", "Baggage", 208, false],
    ]),
    fwd: [
      { lb: 2400, arm: 137 },
      { lb: 3400, arm: 142 },
    ],
    aft: [
      { lb: 2400, arm: 148.1 },
      { lb: 3400, arm: 148.1 },
    ],
    toRoll: 1100,
    to50: 1800,
    ldgRoll: 900,
    ldg50: 1600,
    refLb: 3400,
    liftoffKt: 73,
    approachKt: 80,
  },
];

export function profileById(id: string): Aircraft {
  return PROFILES.find((p) => p.profileId === id) ?? PROFILES[0];
}

export function resolveAircraft(raw: Partial<Aircraft> | undefined): Aircraft {
  const base = profileById(raw?.profileId ?? "c172s");
  return {
    ...base,
    ...raw,
    profileId: raw?.profileId && PROFILES.some((p) => p.profileId === raw.profileId) ? raw.profileId : base.profileId,
    stations: raw?.stations?.length ? raw.stations : base.stations,
    fwd: raw?.fwd?.length ? raw.fwd : base.fwd,
    aft: raw?.aft?.length ? raw.aft : base.aft,
  };
}

export const DEFAULT_LOADS: Record<string, number> = {
  pilot: 180,
  copilot: 160,
  rear: 0,
  bags: 15,
};

export const CHECKS: { phase: string; items: string[] }[] = [
  {
    phase: "Before leaving",
    items: [
      "Documents, charts, and briefing are current",
      "NOTAMs and TFRs reviewed from an official source",
      "Weight, balance, and fuel are inside limits",
      "Takeoff and landing distances fit the runway",
      "Risk score reviewed, mitigations written if needed",
    ],
  },
  {
    phase: "Preflight",
    items: [
      "Aircraft documents on board",
      "Control lock and pitot cover removed",
      "Fuel quantity checked against the gauge and the plan",
      "Oil quantity within the aircraft limits",
      "Tires, brakes, and propeller checked",
      "Flight controls free and correct",
    ],
  },
  {
    phase: "Before takeoff",
    items: [
      "Doors and windows latched",
      "Flight instruments set and altimeter checked",
      "Fuel selector on the proper tank",
      "Trim and flaps set for takeoff",
      "Lights and transponder as required",
      "Runway, wind, and abort point briefed",
    ],
  },
  {
    phase: "Approach",
    items: [
      "Weather and runway at the destination rechecked",
      "Fuel sufficient for the approach plus reserve",
      "Altimeter set",
      "Approach and missed approach briefed",
      "Passenger briefing done",
    ],
  },
  {
    phase: "Shutdown",
    items: [
      "Hobbs, tach, and fuel recorded",
      "Squawks written on the rental sheet",
      "Controls secured as required",
      "Logbook draft reviewed before it is saved",
    ],
  },
];

export function checkId(phase: string, index: number): string {
  return `${phase}-${index}`;
}
