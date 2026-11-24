import * as piano from './piano.mjs';
import * as saxophone from './saxophone.mjs';
import * as strings from './strings.mjs';

export const INSTRUMENTS = {
  strings,
  saxophone,
  piano,
};

export function getInstrumentModule(id) {
  return INSTRUMENTS[id] ?? strings;
}
