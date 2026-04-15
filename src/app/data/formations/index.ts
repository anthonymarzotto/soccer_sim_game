import { FormationSchema } from '../../models/formation.types';
import { FORMATION_4_4_2 } from './formation-4-4-2';
import { FORMATION_4_4_2_NARROW_DIAMOND } from './formation-4-4-2-narrow-diamond';
import { FORMATION_4_4_2_WIDE_DIAMOND } from './formation-4-4-2-wide-diamond';
import { FORMATION_4_3_3 } from './formation-4-3-3';
import { FORMATION_3_5_2 } from './formation-3-5-2';
import { FORMATION_5_3_2 } from './formation-5-3-2';
import { FORMATION_4_5_1 } from './formation-4-5-1';
import { FORMATION_3_6_1 } from './formation-3-6-1';

export const ALL_PREDEFINED_FORMATIONS: FormationSchema[] = [
  FORMATION_4_4_2,
  FORMATION_4_4_2_NARROW_DIAMOND,
  FORMATION_4_4_2_WIDE_DIAMOND,
  FORMATION_4_3_3,
  FORMATION_3_5_2,
  FORMATION_4_5_1,
  FORMATION_5_3_2,
  FORMATION_3_6_1
];
