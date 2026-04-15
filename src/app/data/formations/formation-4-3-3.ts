import { FieldZone, Position } from '../../models/enums';
import { FormationSchema } from '../../models/formation.types';

export const FORMATION_4_3_3: FormationSchema = {
  id: 'formation_4_3_3',
  name: '4-3-3',
  shortCode: '4-3-3',
  description: 'Front-three system with three central midfielders and overlapping full-backs.',
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
      slotId: 'def_l',
      label: 'Left Back',
      preferredPosition: Position.DEFENDER,
      coordinates: { x: 21, y: 24 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'def_lc',
      label: 'Left Center-Back',
      preferredPosition: Position.DEFENDER,
      coordinates: { x: 38, y: 16 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'def_rc',
      label: 'Right Center-Back',
      preferredPosition: Position.DEFENDER,
      coordinates: { x: 62, y: 16 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'def_r',
      label: 'Right Back',
      preferredPosition: Position.DEFENDER,
      coordinates: { x: 79, y: 24 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'mid_lc',
      label: 'Left Central Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 36, y: 52 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_c',
      label: 'Central Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 50, y: 47 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_rc',
      label: 'Right Central Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 64, y: 52 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'att_l',
      label: 'Left Winger',
      preferredPosition: Position.FORWARD,
      coordinates: { x: 22, y: 78 },
      zone: FieldZone.ATTACK
    },
    {
      slotId: 'att_c',
      label: 'Center Forward',
      preferredPosition: Position.FORWARD,
      coordinates: { x: 50, y: 84 },
      zone: FieldZone.ATTACK
    },
    {
      slotId: 'att_r',
      label: 'Right Winger',
      preferredPosition: Position.FORWARD,
      coordinates: { x: 78, y: 78 },
      zone: FieldZone.ATTACK
    }
  ]
};
