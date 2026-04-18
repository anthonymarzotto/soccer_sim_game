import { FieldZone, Position } from '../../models/enums';
import { FormationSchema } from '../../models/formation.types';

export const FORMATION_3_5_2: FormationSchema = {
  id: 'formation_3_5_2',
  name: 'The Winged Fortress',
  shortCode: '3-5-2',
  description: 'Three center-backs, wing-backs, and a midfield five supporting two forwards.',
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
      coordinates: { x: 14, y: 50 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_lc',
      label: 'Left Central Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 36, y: 54 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_c',
      label: 'Central Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 50, y: 50 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_rc',
      label: 'Right Central Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 64, y: 54 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_rwb',
      label: 'Right Wing-Back',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 86, y: 50 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'att_l',
      label: 'Left Striker',
      preferredPosition: Position.FORWARD,
      coordinates: { x: 42, y: 82 },
      zone: FieldZone.ATTACK
    },
    {
      slotId: 'att_r',
      label: 'Right Striker',
      preferredPosition: Position.FORWARD,
      coordinates: { x: 58, y: 82 },
      zone: FieldZone.ATTACK
    }
  ]
};
