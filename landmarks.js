// Landmarks: target point (lon, lat, ellipsoid height in m) and the camera offset used to frame it.
// heading: compass direction the camera looks (deg), pitch: down-tilt (negative deg), range: distance (m).
// Heights are ground elevation (Copernicus DEM) + the local geoid offset (about -35 m), because
// Google's 3D Tiles use WGS84 ellipsoid heights.

export const GEOID = -35;

export const LANDMARKS = [
  {
    id: 'overview', name: 'Overview', kicker: 'Los Angeles Basin',
    text: 'From Santa Monica Bay the basin opens up: the Santa Monica Mountains run along the north, Hollywood sits under the sign, and the Downtown skyline rises 25 km inland.',
    lon: -118.395, lat: 34.045, h: 31, heading: 62, pitch: -17, range: 27000, label: false,
  },
  {
    id: 'santa-monica-pier', name: 'Santa Monica Pier', short: 'Pier', kicker: 'Santa Monica',
    text: 'Opened in 1909, the pier is the end of Route 66 and home to Pacific Park and its solar-powered Ferris wheel, the landmark of the Santa Monica shoreline.',
    lon: -118.4977, lat: 34.0087, h: -29, heading: 30, pitch: -16, range: 600, labelLift: 50,
  },
  {
    id: 'venice-beach', name: 'Venice Beach', short: 'Venice', kicker: 'Venice',
    text: 'The Ocean Front Walk boardwalk, Muscle Beach and the skatepark line a wide sand beach. Inland, the Venice Canals date back to 1905.',
    lon: -118.4730, lat: 33.9850, h: -30, heading: 70, pitch: -21, range: 950, labelLift: 40,
  },
  {
    id: 'getty-center', name: 'Getty Center', short: 'Getty', kicker: 'Brentwood',
    text: 'Richard Meier\'s travertine campus sits on a hilltop above the 405, with views from the ocean to Downtown on a clear day.',
    lon: -118.4751, lat: 34.0765, h: 226, heading: 20, pitch: -32, range: 780, labelLift: 60,
  },
  {
    id: 'century-city', name: 'Century City', short: 'Century City', kicker: 'Westside',
    text: 'Built on the former 20th Century Fox backlot, this cluster of towers is the Westside\'s business district, next to the studio that still operates there.',
    lon: -118.4170, lat: 34.0575, h: 75, heading: 55, pitch: -16, range: 1500, labelLift: 230,
  },
  {
    id: 'hollywood', name: 'Hollywood', short: 'Hollywood', kicker: 'Hollywood Blvd',
    text: 'The Walk of Fame, the TCL Chinese Theatre and the Dolby Theatre, home of the Oscars, share a few blocks of Hollywood Boulevard below the hills.',
    lon: -118.3390, lat: 34.1017, h: 100, heading: 24, pitch: -14, range: 1300, labelLift: 70,
  },
  {
    id: 'hollywood-sign', name: 'Hollywood Sign', short: 'Sign', kicker: 'Mount Lee',
    text: 'The 45-foot letters went up in 1923 as "HOLLYWOODLAND", a real-estate ad. They sit on the south face of Mount Lee in Griffith Park.',
    lon: -118.32165, lat: 34.13410, h: 446, heading: 340, pitch: -6, range: 620, labelLift: 40,
  },
  {
    id: 'griffith-observatory', name: 'Griffith Observatory', short: 'Griffith', kicker: 'Griffith Park',
    text: 'The 1935 Art Deco observatory looks over the whole basin from Mount Hollywood, with the Hollywood Sign on the next ridge to the west.',
    lon: -118.30036, lat: 34.11825, h: 311, heading: 320, pitch: -15, range: 620, labelLift: 25,
  },
  {
    id: 'downtown', name: 'Downtown LA', short: 'Downtown', kicker: 'DTLA',
    text: 'The Wilshire Grand Center (335 m) and the U.S. Bank Tower anchor the skyline, a few blocks from Walt Disney Concert Hall on Bunker Hill.',
    lon: -118.2560, lat: 34.0507, h: 150, heading: 40, pitch: -7, range: 2150, labelLift: 300,
  },
  {
    id: 'lax', name: 'LAX', short: 'LAX', kicker: 'Westchester',
    text: 'Los Angeles International Airport, with the 1961 Theme Building at the center of its horseshoe of terminals and four parallel runways running to the ocean.',
    lon: -118.4081, lat: 33.9425, h: 9, heading: 80, pitch: -24, range: 3600, labelLift: 70,
  },
];

// Guided tour: landmark id and how long to orbit there (seconds).
export const TOUR = [
  { id: 'overview', dwell: 4 },
  { id: 'santa-monica-pier', dwell: 7 },
  { id: 'venice-beach', dwell: 6 },
  { id: 'getty-center', dwell: 6 },
  { id: 'century-city', dwell: 6 },
  { id: 'hollywood', dwell: 6 },
  { id: 'hollywood-sign', dwell: 7 },
  { id: 'griffith-observatory', dwell: 6 },
  { id: 'downtown', dwell: 8 },
  { id: 'overview', dwell: 4 },
];

// Night-time light sources: [lon, lat, ellipsoid height] with a color and size.
// The Ferris wheel is drawn as an animated ring in traffic.js.
// Positions come from OpenStreetMap; heights were sampled from the Google 3D Tiles surface.
export const FERRIS_WHEEL = { lon: -118.49784, lat: 34.00825, h: -29, radius: 13, azimuth: 52 };

export const NIGHT_LIGHTS = [
  // Hollywood Sign letters, west to east
  ...Array.from({ length: 9 }, (_, i) => ({
    lon: -118.32221 + i * 0.000140, lat: 34.13393 + i * 0.0000427, h: 450 + i, color: '#fff6e0', size: 9,
  })),
  // Griffith Observatory domes
  { lon: -118.30036, lat: 34.11825, h: 330, color: '#ffe2b0', size: 14 },
  { lon: -118.30060, lat: 34.11835, h: 326, color: '#ffe2b0', size: 9 },
  { lon: -118.30012, lat: 34.11815, h: 324, color: '#ffe2b0', size: 9 },
  // Downtown crowns
  { lon: -118.25982, lat: 34.05006, h: 337, color: '#7fd3ff', size: 14 },   // Wilshire Grand
  { lon: -118.25438, lat: 34.05100, h: 370, color: '#ffffff', size: 12 },   // U.S. Bank Tower
  { lon: -118.25712, lat: 34.04914, h: 314, color: '#ffd27a', size: 10 },
  { lon: -118.25546, lat: 34.04906, h: 236, color: '#ffffff', size: 9 },
  // Santa Monica Pier deck lights, shore to end
  ...Array.from({ length: 14 }, (_, i) => ({
    lon: -118.49599 - i * 0.000301, lat: 34.01049 - i * 0.000226, h: -25, color: '#ffd9a0', size: 6,
  })),
  // LAX Theme Building
  { lon: -118.40265, lat: 33.94380, h: 40, color: '#b98cff', size: 12 },
];
