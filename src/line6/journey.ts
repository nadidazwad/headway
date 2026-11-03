/**
 * The truth of the figure. Everything on screen that moves or reads a number comes from here.
 * Sources: Wikipedia "MRT Line 6" for speed, acceleration, phase lengths and car size;
 * OpenStreetMap station coordinates for the spacing, scaled so each phase matches its length.
 */
export const LINE_FACTS = {
  topSpeedKmh: 100,
  accelerationKmhPerS: 3.5,
  dwellSeconds: 30,
  carLengthM: 19.8,
  carWidthM: 2.95,
  carHeightM: 4.1,
  cars: 6,
  railHeightM: 13,
  gaugeMm: 1435,
  overheadVolts: 1500,
} as const;

export interface Station {
  en: string;
  bn: string;
  /** Distance from Uttara North along the line. */
  km: number;
}

const NAMES: ReadonlyArray<readonly [string, string]> = [
  ["Uttara North", "উত্তরা উত্তর"],
  ["Uttara Center", "উত্তরা সেন্টার"],
  ["Uttara South", "উত্তরা দক্ষিণ"],
  ["Pallabi", "পল্লবী"],
  ["Mirpur 11", "মিরপুর ১১"],
  ["Mirpur 10", "মিরপুর ১০"],
  ["Kazipara", "কাজীপাড়া"],
  ["Shewrapara", "শেওড়াপাড়া"],
  ["Agargaon", "আগারগাঁও"],
  ["Bijoy Sarani", "বিজয় সরণি"],
  ["Farmgate", "ফার্মগেট"],
  ["Karwan Bazar", "কারওয়ান বাজার"],
  ["Shahbag", "শাহবাগ"],
  ["Dhaka University", "ঢাকা বিশ্ববিদ্যালয়"],
  ["Bangladesh Secretariat", "বাংলাদেশ সচিবালয়"],
  ["Motijheel", "মতিঝিল"],
];

const GAPS_KM = [1.21,1.75,2.48,0.9,1.39,1.22,1.12,1.66,1.47,0.98,1.11,1.44,0.93,1.17,1.28];

export const STATIONS: readonly Station[] = NAMES.map(([en, bn], index) => ({
  en,
  bn,
  km: GAPS_KM.slice(0, index).reduce((sum, gap) => sum + gap, 0),
}));

const LINE_KM = STATIONS[STATIONS.length - 1]!.km;

/** One world metre stands for this many metres of the real line, so stations come round often. */
export const VISUAL_SCALE = 3.2;
/** Simulated seconds per real second. */
export const TIME_SCALE = 1.6;
/** World metres a station occupies, centred on its stopping point. */
export const STATION_SPAN = 168;
/** Length of the six-car train in world metres, head to tail. */
export const TRAIN_LENGTH = LINE_FACTS.cars * 20;

const TOP_SPEED = LINE_FACTS.topSpeedKmh / 3.6;
const ACCELERATION = LINE_FACTS.accelerationKmhPerS / 3.6;

export type Phase = "dwell" | "accelerate" | "cruise" | "brake";

export interface JourneyState {
  /** World metres travelled since the start, never decreasing. */
  distance: number;
  /** Real speed the model is running at. */
  speedKmh: number;
  phase: Phase;
  /** Which end-to-end run this is. Odd runs head back towards Uttara North. */
  run: number;
  from: Station;
  to: Station;
  /** Real kilometres from Uttara North. */
  km: number;
  /** Real metres to the next stop. */
  metersToNext: number;
  /** 0 at rest with doors shut, 1 with doors fully open. */
  doors: number;
  /** Rises by one each time the train leaves a station; passengers change with it. */
  stopIndex: number;
  towards: Station;
}

export interface StationStop {
  station: Station;
  /** World metre along the endless line where the head of the train stops. */
  distance: number;
  /** World metre of the middle of the platform, half a train behind the stopping point. */
  center: number;
  stopIndex: number;
}

/** The nth stop of the endless shuttle: 0 is Uttara North, 15 Motijheel, 30 Uttara North again. */
function stationAtStop(stopIndex: number): Station {
  const period = (STATIONS.length - 1) * 2;
  const position = ((stopIndex % period) + period) % period;
  return STATIONS[position < STATIONS.length ? position : period - position]!;
}

const PERIOD_STOPS = (STATIONS.length - 1) * 2;
const PERIOD_METERS = ((LINE_KM * 1000) / VISUAL_SCALE) * 2;

function stopDistance(stopIndex: number): number {
  const period = Math.floor(stopIndex / PERIOD_STOPS);
  const within = stopIndex - period * PERIOD_STOPS;
  let meters = 0;
  for (let i = 0; i < within; i++) {
    meters += (Math.abs(stationAtStop(i + 1).km - stationAtStop(i).km) * 1000) / VISUAL_SCALE;
  }
  return period * PERIOD_METERS + meters;
}

/** Every station stop whose span touches the given stretch of the endless line. */
export function stationStops(fromDistance: number, toDistance: number): StationStop[] {
  const out: StationStop[] = [];
  const firstPeriod = Math.floor((fromDistance - STATION_SPAN) / PERIOD_METERS);
  for (let stop = Math.max(firstPeriod, 0) * PERIOD_STOPS; ; stop++) {
    const distance = stopDistance(stop);
    const center = distance - TRAIN_LENGTH / 2;
    if (center - STATION_SPAN / 2 > toDistance) break;
    if (center + STATION_SPAN / 2 >= fromDistance) out.push({ station: stationAtStop(stop), distance, center, stopIndex: stop });
  }
  return out;
}

export interface Journey {
  /** Advances by real seconds, returning the new state. */
  advance(seconds: number): JourneyState;
  readonly state: JourneyState;
}

const DOOR_SECONDS = 3;

export function createJourney(startStop = 0): Journey {
  let stop = startStop;
  let meters = 0; // real metres from the current stop
  let speed = 0; // real m/s
  let dwell = LINE_FACTS.dwellSeconds * 0.5;

  const gapMeters = (): number => Math.abs(stationAtStop(stop + 1).km - stationAtStop(stop).km) * 1000;

  const read = (): JourneyState => {
    const gap = gapMeters();
    const from = stationAtStop(stop);
    const to = stationAtStop(stop + 1);
    const run = Math.floor(stop / (STATIONS.length - 1));
    const direction = to.km >= from.km ? 1 : -1;
    const brakingDistance = (speed * speed) / (2 * ACCELERATION);
    let phase: Phase;
    if (dwell > 0) phase = "dwell";
    else if (gap - meters <= brakingDistance + 0.5) phase = "brake";
    else if (speed < TOP_SPEED - 0.01) phase = "accelerate";
    else phase = "cruise";
    const dwellElapsed = LINE_FACTS.dwellSeconds - dwell;
    const doors = dwell > 0 ? Math.min(1, Math.min(dwellElapsed, dwell) / DOOR_SECONDS) : 0;
    return {
      distance: stopDistance(stop) + meters / VISUAL_SCALE,
      speedKmh: speed * 3.6,
      phase,
      run,
      from,
      to,
      km: from.km + (direction * meters) / 1000,
      metersToNext: gap - meters,
      doors: Math.max(doors, 0),
      stopIndex: stop,
      towards: direction > 0 ? STATIONS[STATIONS.length - 1]! : STATIONS[0]!,
    };
  };

  let state = read();

  return {
    advance(seconds) {
      let remaining = seconds * TIME_SCALE;
      while (remaining > 1e-6) {
        const step = Math.min(remaining, 0.05);
        remaining -= step;
        if (dwell > 0) {
          dwell = Math.max(0, dwell - step);
          continue;
        }
        const gap = gapMeters();
        const brakingDistance = (speed * speed) / (2 * ACCELERATION);
        if (gap - meters <= brakingDistance + 0.5) speed = Math.max(0.6, speed - ACCELERATION * step);
        else speed = Math.min(TOP_SPEED, speed + ACCELERATION * step);
        meters += speed * step;
        if (meters >= gap) {
          stop += 1;
          meters = 0;
          speed = 0;
          dwell = LINE_FACTS.dwellSeconds;
        }
      }
      state = read();
      return state;
    },
    get state() {
      return state;
    },
  };
}
