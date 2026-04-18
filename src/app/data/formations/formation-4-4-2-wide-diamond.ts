import { FieldZone, Position } from '../../models/enums';
import { FormationSchema } from '../../models/formation.types';

export const FORMATION_4_4_2_WIDE_DIAMOND: FormationSchema = {
  id: 'formation_4_4_2_wide_diamond',
  name: 'The Sparkling Formation',
  shortCode: '4-4-2 WD',
  description: 'Diamond-style midfield that stretches wider with natural width from midfield and full-backs.',
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
      slotId: 'mid_dm',
      label: 'Defensive Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 50, y: 44 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_lm',
      label: 'Left Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 24, y: 58 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_rm',
      label: 'Right Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 76, y: 58 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_am',
      label: 'Attacking Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 50, y: 68 },
      zone: FieldZone.ATTACK
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
