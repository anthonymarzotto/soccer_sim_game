import { FieldZone, Position } from '../../models/enums';
import { FormationSchema } from '../../models/formation.types';

export const FORMATION_4_4_2: FormationSchema = {
  id: 'formation_4_4_2',
  name: 'Classic 4-4-2',
  shortCode: '4-4-2',
  description: 'Traditional balanced formation with four defenders, four midfielders, and two strikers.',
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
      coordinates: { x: 20, y: 25 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'def_lc',
      label: 'Left Center-Back',
      preferredPosition: Position.DEFENDER,
      coordinates: { x: 35, y: 15 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'def_rc',
      label: 'Right Center-Back',
      preferredPosition: Position.DEFENDER,
      coordinates: { x: 65, y: 15 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'def_r',
      label: 'Right Back',
      preferredPosition: Position.DEFENDER,
      coordinates: { x: 80, y: 25 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'mid_l',
      label: 'Left Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 15, y: 50 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_lc',
      label: 'Left Center-Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 40, y: 50 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_rc',
      label: 'Right Center-Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 60, y: 50 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_r',
      label: 'Right Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 85, y: 50 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'att_l',
      label: 'Left Striker',
      preferredPosition: Position.FORWARD,
      coordinates: { x: 35, y: 80 },
      zone: FieldZone.ATTACK
    },
    {
      slotId: 'att_r',
      label: 'Right Striker',
      preferredPosition: Position.FORWARD,
      coordinates: { x: 65, y: 80 },
      zone: FieldZone.ATTACK
    }
  ]
};
