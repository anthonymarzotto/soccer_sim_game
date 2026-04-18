import { FieldZone, Position } from '../../models/enums';
import { FormationSchema } from '../../models/formation.types';

export const FORMATION_4_5_1: FormationSchema = {
  id: 'formation_4_5_1',
  name: 'The Midfield Wave',
  shortCode: '4-5-1',
  description: 'Solid four-man defence with a wide five-man midfield and a lone central striker.',
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
      coordinates: { x: 20, y: 24 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'def_lc',
      label: 'Left Center-Back',
      preferredPosition: Position.DEFENDER,
      coordinates: { x: 37, y: 16 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'def_rc',
      label: 'Right Center-Back',
      preferredPosition: Position.DEFENDER,
      coordinates: { x: 63, y: 16 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'def_r',
      label: 'Right Back',
      preferredPosition: Position.DEFENDER,
      coordinates: { x: 80, y: 24 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'mid_l',
      label: 'Left Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 12, y: 52 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_lc',
      label: 'Left Center-Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 35, y: 52 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_c',
      label: 'Center-Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 50, y: 48 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_rc',
      label: 'Right Center-Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 65, y: 52 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_r',
      label: 'Right Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 88, y: 52 },
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
