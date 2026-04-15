import { FieldZone, Position } from '../../models/enums';
import { FormationSchema } from '../../models/formation.types';

export const FORMATION_3_6_1: FormationSchema = {
  id: 'formation_3_6_1',
  name: '3-6-1',
  shortCode: '3-6-1',
  description: 'Three center-backs, a six-man midfield with wing-backs and advanced runners, and a lone striker.',
  isUserDefined: false,
  createdAt: 0,
  slots: [
    {
      slotId: 'gk_1',
      label: 'Goalkeeper',
      preferredPosition: Position.GOALKEEPER,
      coordinates: { x: 50, y: 5 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'def_lc',
      label: 'Left Center-Back',
      preferredPosition: Position.DEFENDER,
      coordinates: { x: 34, y: 18 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'def_c',
      label: 'Center-Back',
      preferredPosition: Position.DEFENDER,
      coordinates: { x: 50, y: 14 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'def_rc',
      label: 'Right Center-Back',
      preferredPosition: Position.DEFENDER,
      coordinates: { x: 66, y: 18 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'mid_lwb',
      label: 'Left Wing-Back',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 12, y: 44 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_lcm',
      label: 'Left Central Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 34, y: 52 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_lam',
      label: 'Left Advanced Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 40, y: 64 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_ram',
      label: 'Right Advanced Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 60, y: 64 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_rcm',
      label: 'Right Central Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 66, y: 52 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_rwb',
      label: 'Right Wing-Back',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 88, y: 44 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'att_c',
      label: 'Center Forward',
      preferredPosition: Position.FORWARD,
      coordinates: { x: 50, y: 82 },
      zone: FieldZone.ATTACK
    }
  ]
};
