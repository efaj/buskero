import * as piano from './piano.mjs';
import * as saxophone from './saxophone.mjs';
import * as violin from './violin.mjs';

export const INSTRUMENTS = {
  violin,
  saxophone,
  piano,
};

export function getInstrumentModule(id) {
  return INSTRUMENTS[id] ?? violin;
}
