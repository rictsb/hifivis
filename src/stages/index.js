import overview from './overview.js';
import power from './power.js';
import streamer from './streamer.js';
import dac from './dac.js';
import turntable from './turntable.js';
import phono from './phono.js';
import preamp from './preamp.js';
import xover from './xover.js';
import amp from './amp.js';
import speaker from './speaker.js';
import sub from './sub.js';
import air from './air.js';

/** Order defines the chapter rail and the ←/→ walk. */
export const STAGES = [
  overview,
  power, streamer, dac,
  turntable, phono,
  preamp, xover, amp,
  speaker, sub, air,
];
