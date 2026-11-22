const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const modulo = (value, period) => ((value % period) + period) % period;
const clamp = value => Math.max(-1, Math.min(1, value));
const CAMPUS_LATITUDE = 23.72220495, CAMPUS_LONGITUDE = 89.15084115;
export const DEFAULT_LIGHTING_DATE = '2026-03-20T06:05:00.000Z';
export const SOLAR_SOURCE_URL = 'https://gml.noaa.gov/grad/solcalc/calcdetails.html';

function absoluteDate(input) {
  if (typeof input === 'string') {
    // Require a timezone: parsing a device-local date would change the same scene
    // between computers. Validate the calendar before Date can normalize it.
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(input);
    if (!match) throw new RangeError('Solar date must identify an absolute ISO timestamp with timezone');
    const [, year, month, day, hour, minute, second = '0', , zone] = match;
    const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
    if (+month < 1 || +month > 12 || +day < 1 || +day > days || +hour > 23 || +minute > 59 || +second > 59 ||
      (zone !== 'Z' && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59))) {
      throw new RangeError('Solar date contains invalid calendar or clock values');
    }
  } else if (!(input instanceof Date) && typeof input !== 'number') {
    throw new TypeError('Solar date must be a Date, epoch milliseconds or timezone-qualified ISO timestamp');
  }
  const date = new Date(input instanceof Date ? input.getTime() : input);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1800 || date.getUTCFullYear() > 2100) {
    throw new RangeError('Solar date must be finite and within the supported 1800–2100 approximation range');
  }
  return date;
}

/**
 * NOAA/Meeus solar approximation, evaluated entirely from the requested UTC
 * instant. Angles are degrees; azimuth is clockwise from geographic north.
 * Direction points TOWARD the sun in the map's east/up/south (+X/+Y/+Z) basis.
 * Altitude is geometric solar-center elevation, without refraction/parallax.
 * NOAA source equations: https://gml.noaa.gov/grad/solcalc/main.js
 */
export function campusSunPosition({ date, latitude = CAMPUS_LATITUDE, longitude = CAMPUS_LONGITUDE } = {}) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new RangeError('Solar latitude must be finite and within -90..90 degrees');
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new RangeError('Solar longitude must be finite and within -180..180 degrees east');
  const instant = absoluteDate(date);
  const julianDay = instant.getTime() / 86400000 + 2440587.5;
  const t = (julianDay - 2451545) / 36525;
  const meanLongitude = modulo(280.46646 + t * (36000.76983 + .0003032 * t), 360) * RAD;
  const anomaly = (357.52911 + t * (35999.05029 - .0001537 * t)) * RAD;
  const eccentricity = .016708634 - t * (.000042037 + .0000001267 * t);
  const center = Math.sin(anomaly) * (1.914602 - t * (.004817 + .000014 * t)) +
    Math.sin(2 * anomaly) * (.019993 - .000101 * t) + .000289 * Math.sin(3 * anomaly);
  const omega = (125.04 - 1934.136 * t) * RAD;
  const apparentLongitude = meanLongitude + (center - .00569 - .00478 * Math.sin(omega)) * RAD;
  const obliquitySeconds = 21.448 - t * (46.815 + t * (.00059 - .001813 * t));
  const obliquity = (23 + (26 + obliquitySeconds / 60) / 60 + .00256 * Math.cos(omega)) * RAD;
  const declination = Math.asin(clamp(Math.sin(obliquity) * Math.sin(apparentLongitude)));
  const y = Math.tan(obliquity / 2) ** 2;
  const equationOfTimeMinutes = 4 * DEG * (y * Math.sin(2 * meanLongitude) - 2 * eccentricity * Math.sin(anomaly) +
    4 * eccentricity * y * Math.sin(anomaly) * Math.cos(2 * meanLongitude) -
    .5 * y * y * Math.sin(4 * meanLongitude) - 1.25 * eccentricity ** 2 * Math.sin(2 * anomaly));
  const utcMinutes = instant.getUTCHours() * 60 + instant.getUTCMinutes() +
    instant.getUTCSeconds() / 60 + instant.getUTCMilliseconds() / 60000;
  const solarMinutes = modulo(utcMinutes + equationOfTimeMinutes + 4 * longitude, 1440);
  const hourAngle = (solarMinutes / 4 - 180) * RAD, lat = latitude * RAD;
  // Direct vector rotation avoids division by cos(latitude) at the poles and
  // avoids using a guessed hemisphere sign for the noon azimuth.
  const east = -Math.cos(declination) * Math.sin(hourAngle);
  const up = Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);
  const south = Math.sin(lat) * Math.cos(declination) * Math.cos(hourAngle) - Math.cos(lat) * Math.sin(declination);
  const length = Math.hypot(east, up, south);
  const direction = { x: east / length, y: up / length, z: south / length };
  const azimuthDefined = Math.hypot(east, south) > 1e-12;
  const altitude = Math.asin(clamp(direction.y)) * DEG;
  const azimuth = azimuthDefined ? modulo(Math.atan2(east, -south) * DEG, 360) : 0;
  return { direction, altitude, azimuth, angleUnits: 'degrees', azimuthDefined,
    aboveHorizon: altitude > 0, date: instant.toISOString(), latitude, longitude,
    declinationDegrees: declination * DEG, hourAngleDegrees: hourAngle * DEG, equationOfTimeMinutes,
    method: 'NOAA/Meeus approximation; geometric solar center without atmospheric refraction',
    sourceUrl: SOLAR_SOURCE_URL, refractionApplied: false };
}

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

// Named daytime art directions, not observations, forecasts or climatology.
export const LIGHTING_PRESETS = freeze({
  clear: { skyColor: 0xb3d5e6, sun: { color: 0xfff1dc, intensity: 2.15 },
    hemisphere: { skyColor: 0xe4edf2, groundColor: 0x829272, intensity: 1.6 },
    fog: { color: 0xb3d5e6, near: 300, far: 1000 } },
  hazy: { skyColor: 0xc5d2d5, sun: { color: 0xffead1, intensity: 1.8 },
    hemisphere: { skyColor: 0xe6e8e1, groundColor: 0x8c9278, intensity: 1.7 },
    fog: { color: 0xc5d2d5, near: 260, far: 850 } },
  overcast: { skyColor: 0xc7cdcc, sun: { color: 0xf2f0e9, intensity: .55 },
    hemisphere: { skyColor: 0xe2e4e0, groundColor: 0x8b927f, intensity: 1.9 },
    fog: { color: 0xc7cdcc, near: 220, far: 700 } },
});

/** Deterministic render configuration; returned colors/intensities/fog are art choices. */
export function campusLighting({ date = DEFAULT_LIGHTING_DATE, latitude = CAMPUS_LATITUDE,
  longitude = CAMPUS_LONGITUDE, preset = 'hazy' } = {}) {
  if (!Object.hasOwn(LIGHTING_PRESETS, preset)) throw new RangeError('Unknown lighting preset; choose clear, hazy or overcast');
  const palette = structuredClone(LIGHTING_PRESETS[preset]);
  const solar = campusSunPosition({ date, latitude, longitude });
  // Daytime ambient palettes do not implement a night/weather simulation. A sun
  // below the geometric horizon must nevertheless stop contributing direct light.
  palette.sun.intensity = solar.aboveHorizon ? palette.sun.intensity : 0;
  const sunOffset = Object.fromEntries(Object.entries(solar.direction).map(([axis, value]) => [axis, value * 150]));
  return { ...palette, solar, sunOffset, preset, appearanceStatus: 'artistic',
    appearanceReason: 'Fixed representative date and named daytime palette; not actual weather or measured campus climatology.' };
}

// Representative Kushtia (UTC+6 / BST) dates across three seasons and four times of day:
// morning (~08:35), midday (~12:05), golden (~16:15), and dusk (~17:45).
export const TIME_OF_DAY_DATES = freeze({
  march: {
    morning: '2026-03-20T02:35:00.000Z',
    midday: '2026-03-20T06:05:00.000Z',
    golden: '2026-03-20T10:15:00.000Z',
    dusk: '2026-03-20T11:45:00.000Z',
  },
  june: {
    morning: '2026-06-21T02:35:00.000Z',
    midday: '2026-06-21T06:05:00.000Z',
    golden: '2026-06-21T10:15:00.000Z',
    dusk: '2026-06-21T11:45:00.000Z',
  },
  december: {
    morning: '2026-12-21T02:35:00.000Z',
    midday: '2026-12-21T06:05:00.000Z',
    golden: '2026-12-21T10:15:00.000Z',
    dusk: '2026-12-21T11:45:00.000Z',
  },
});

// Named artistic lighting + Preetham Sky + calibrated LDR IBL presets for time-of-day moods.
export const TIME_OF_DAY_PRESETS = freeze({
  morning: {
    label: 'Morning',
    localTimeLabel: '08:35 BST',
    skyColor: 0x9ec8eb,
    sun: { color: 0xfff0d4, intensity: 2.35 },
    hemisphere: { skyColor: 0x9ec8eb, groundColor: 0x566945, intensity: 0.78 },
    fog: { color: 0xb7d4e6, near: 340, far: 1200 },
    sky: {
      turbidity: 2.6,
      rayleigh: 1.45,
      mieCoefficient: 0.003,
      mieDirectionalG: 0.78,
      cloudOpacity: 0.30,
      cloudTint: 0xfff7ec,
    },
    envColors: {
      zenith: 0x4586c9,
      horizon: 0xc9e1f0,
      ground: 0x566945,
    },
    envIntensity: 0.45,
    exposure: 0.92,
    emissiveBoost: 0.0,
    minSunAltitudeDeg: 10,
  },
  midday: {
    label: 'Midday',
    localTimeLabel: '12:05 BST',
    skyColor: 0x9bc7e6,
    sun: { color: 0xfff5e4, intensity: 2.55 },
    hemisphere: { skyColor: 0xa4cee8, groundColor: 0x5c6e4b, intensity: 0.82 },
    fog: { color: 0xbfd8e6, near: 360, far: 1250 },
    sky: {
      turbidity: 3.0,
      rayleigh: 1.35,
      mieCoefficient: 0.0035,
      mieDirectionalG: 0.78,
      cloudOpacity: 0.28,
      cloudTint: 0xffffff,
    },
    envColors: {
      zenith: 0x3b7ec7,
      horizon: 0xd0e4f0,
      ground: 0x5c6e4b,
    },
    envIntensity: 0.45,
    exposure: 0.90,
    emissiveBoost: 0.0,
    minSunAltitudeDeg: 15,
  },
  golden: {
    label: 'Golden Hour',
    localTimeLabel: '16:15 BST',
    skyColor: 0x9bb8d6,
    sun: { color: 0xffcf87, intensity: 2.45 },
    hemisphere: { skyColor: 0x93b7db, groundColor: 0x5b5d44, intensity: 0.85 },
    fog: { color: 0xd8c3a5, near: 300, far: 1100 },
    sky: {
      turbidity: 4.8,
      rayleigh: 2.15,
      mieCoefficient: 0.0055,
      mieDirectionalG: 0.82,
      cloudOpacity: 0.38,
      cloudTint: 0xffddb0,
    },
    envColors: {
      zenith: 0x4b7cb8,
      horizon: 0xebc596,
      ground: 0x5b5d44,
    },
    envIntensity: 0.48,
    exposure: 0.92,
    emissiveBoost: 0.25,
    minSunAltitudeDeg: 18,
  },
  dusk: {
    label: 'Dusk',
    localTimeLabel: '17:45 BST',
    skyColor: 0x4b587d,
    sun: { color: 0xff8f4c, intensity: 1.05 },
    hemisphere: { skyColor: 0x6f87bd, groundColor: 0x3b3e47, intensity: 1.05 },
    fog: { color: 0x6a708c, near: 240, far: 900 },
    sky: {
      turbidity: 7.2,
      rayleigh: 2.8,
      mieCoefficient: 0.011,
      mieDirectionalG: 0.86,
      cloudOpacity: 0.44,
      cloudTint: 0xf7a882,
    },
    envColors: {
      zenith: 0x3b4f87,
      horizon: 0xd1927a,
      ground: 0x3b3e47,
    },
    envIntensity: 0.55,
    exposure: 0.98,
    emissiveBoost: 1.0,
    minSunAltitudeDeg: 4.5,
  },
});

const SKY_CONDITION_MODIFIERS = freeze({
  clear: {
    sunScale: 1.0,
    hemiScale: 1.0,
    turbidityAdd: 0.0,
    rayleighScale: 1.0,
    mieScale: 1.0,
    mieGDelta: 0.0,
    fogNearScale: 1.0,
    fogFarScale: 1.0,
    cloudOpacityScale: 0.85,
    exposureOffset: 0.0,
    skyBlend: 0.0,
    skyBlendTarget: 0xc5d2d5,
  },
  hazy: {
    sunScale: 0.84,
    hemiScale: 1.08,
    turbidityAdd: 3.2,
    rayleighScale: 0.92,
    mieScale: 1.45,
    mieGDelta: 0.03,
    fogNearScale: 0.82,
    fogFarScale: 0.84,
    cloudOpacityScale: 1.12,
    exposureOffset: -0.02,
    skyBlend: 0.22,
    skyBlendTarget: 0xcfd6d4,
  },
  overcast: {
    sunScale: 0.32,
    hemiScale: 1.22,
    turbidityAdd: 7.5,
    rayleighScale: 0.55,
    mieScale: 2.1,
    mieGDelta: -0.08,
    fogNearScale: 0.68,
    fogFarScale: 0.68,
    cloudOpacityScale: 1.55,
    exposureOffset: -0.04,
    skyBlend: 0.45,
    skyBlendTarget: 0xc2c8c8,
  },
});

function lerpHexColor(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

function visualDirectionWithHorizonFloor(solar, minAltitudeDeg) {
  const minAlt = Math.max(0.5, minAltitudeDeg) * RAD;
  const rawAlt = Math.asin(clamp(solar.direction.y));
  const clampedAlt = Math.max(minAlt, rawAlt);
  const horiz = Math.hypot(solar.direction.x, solar.direction.z);
  const cosAlt = Math.cos(clampedAlt);
  const sinAlt = Math.sin(clampedAlt);
  if (horiz > 1e-8) {
    return {
      x: (solar.direction.x / horiz) * cosAlt,
      y: sinAlt,
      z: (solar.direction.z / horiz) * cosAlt,
    };
  }
  return { x: 0, y: sinAlt, z: cosAlt };
}

/**
 * Combines exact NOAA solar geometry for a seasonal Kushtia time-of-day with
 * tuned atmospheric scattering and lighting palettes. Preserves true NOAA solar
 * metadata in `solar`, while lifting `visualSunDirection` / `sunOffset` above an
 * aesthetic horizon floor so golden hour and dusk retain warm raking light.
 */
export function campusTimeOfDayLighting({
  season = 'march',
  timeOfDay = 'golden',
  sky = 'clear',
  latitude = CAMPUS_LATITUDE,
  longitude = CAMPUS_LONGITUDE,
} = {}) {
  if (!Object.hasOwn(TIME_OF_DAY_DATES, season)) {
    throw new RangeError('Unknown season; choose march, june or december');
  }
  if (!Object.hasOwn(TIME_OF_DAY_PRESETS, timeOfDay)) {
    throw new RangeError('Unknown timeOfDay; choose morning, midday, golden or dusk');
  }
  if (!Object.hasOwn(SKY_CONDITION_MODIFIERS, sky)) {
    throw new RangeError('Unknown sky preset; choose clear, hazy or overcast');
  }
  const date = TIME_OF_DAY_DATES[season][timeOfDay];
  const base = TIME_OF_DAY_PRESETS[timeOfDay];
  const mod = SKY_CONDITION_MODIFIERS[sky];
  const solar = campusSunPosition({ date, latitude, longitude });
  const visualSunDirection = visualDirectionWithHorizonFloor(solar, base.minSunAltitudeDeg);
  const sunOffset = {
    x: visualSunDirection.x * 150,
    y: visualSunDirection.y * 150,
    z: visualSunDirection.z * 150,
  };
  const skyColor = lerpHexColor(base.skyColor, mod.skyBlendTarget, mod.skyBlend);
  const fogColor = lerpHexColor(base.fog.color, mod.skyBlendTarget, mod.skyBlend);
  const cloudTint = lerpHexColor(base.sky.cloudTint, 0xd8dddd, mod.skyBlend * 0.7);
  const envColors = {
    zenith: lerpHexColor(base.envColors.zenith, mod.skyBlendTarget, mod.skyBlend),
    horizon: lerpHexColor(base.envColors.horizon, mod.skyBlendTarget, mod.skyBlend * 0.85),
    ground: base.envColors.ground,
  };
  const skyParams = {
    turbidity: Number((base.sky.turbidity + mod.turbidityAdd).toFixed(3)),
    rayleigh: Number((base.sky.rayleigh * mod.rayleighScale).toFixed(3)),
    mieCoefficient: Number((base.sky.mieCoefficient * mod.mieScale).toFixed(5)),
    mieDirectionalG: Number(Math.max(0.5, Math.min(0.98, base.sky.mieDirectionalG + mod.mieGDelta)).toFixed(3)),
    cloudOpacity: Number(Math.min(0.88, Math.max(0.08, base.sky.cloudOpacity * mod.cloudOpacityScale)).toFixed(3)),
    cloudTint,
  };
  return {
    season,
    timeOfDay,
    preset: sky,
    skyPreset: sky,
    label: base.label,
    localTimeLabel: base.localTimeLabel,
    skyColor,
    sun: {
      color: base.sun.color,
      intensity: Number((base.sun.intensity * mod.sunScale).toFixed(3)),
    },
    hemisphere: {
      skyColor: lerpHexColor(base.hemisphere.skyColor, mod.skyBlendTarget, mod.skyBlend * 0.5),
      groundColor: base.hemisphere.groundColor,
      intensity: Number((base.hemisphere.intensity * mod.hemiScale).toFixed(3)),
    },
    fog: {
      color: fogColor,
      near: Math.round(base.fog.near * mod.fogNearScale),
      far: Math.round(base.fog.far * mod.fogFarScale),
    },
    sky: skyParams,
    envColors,
    envIntensity: base.envIntensity,
    exposure: Number((base.exposure + mod.exposureOffset).toFixed(3)),
    emissiveBoost: base.emissiveBoost,
    solar,
    visualSunDirection,
    sunOffset,
    appearanceStatus: 'artistic',
    appearanceReason: 'Fixed seasonal Kushtia time-of-day art palette; not actual weather or measured campus climatology.',
  };
}

