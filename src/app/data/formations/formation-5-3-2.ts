import { FieldZone, Position } from '../../models/enums';
import { FormationSchema } from '../../models/formation.types';

export const FORMATION_5_3_2: FormationSchema = {
  id: 'formation_5_3_2',
  name: '5-3-2',
  shortCode: '5-3-2',
  description: 'Back five with wing-backs, three central midfielders, and a strike pair.',
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
      slotId: 'def_lwb',
      label: 'Left Wing-Back',
      preferredPosition: Position.DEFENDER,
      coordinates: { x: 12, y: 36 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'def_lc',
      label: 'Left Center-Back',
      preferredPosition: Position.DEFENDER,
      coordinates: { x: 32, y: 20 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'def_c',
      label: 'Center-Back',
      preferredPosition: Position.DEFENDER,
      coordinates: { x: 50, y: 16 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'def_rc',
      label: 'Right Center-Back',
      preferredPosition: Position.DEFENDER,
      coordinates: { x: 68, y: 20 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'def_rwb',
      label: 'Right Wing-Back',
      preferredPosition: Position.DEFENDER,
      coordinates: { x: 88, y: 36 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'mid_lc',
      label: 'Left Center-Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 34, y: 52 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_c',
      label: 'Center-Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 50, y: 56 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_rc',
      label: 'Right Center-Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 66, y: 52 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'att_l',
      label: 'Left Striker',
      preferredPosition: Position.FORWARD,
      coordinates: { x: 40, y: 80 },
      zone: FieldZone.ATTACK
    },
    {
      slotId: 'att_r',
      label: 'Right Striker',
      preferredPosition: Position.FORWARD,
      coordinates: { x: 60, y: 80 },
      zone: FieldZone.ATTACK
    }
  ]
};
