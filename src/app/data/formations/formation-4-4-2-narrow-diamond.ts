import { FieldZone, Position } from '../../models/enums';
import { FormationSchema } from '../../models/formation.types';

export const FORMATION_4_4_2_NARROW_DIAMOND: FormationSchema = {
  id: 'formation_4_4_2_narrow_diamond',
  name: '4-4-2 (Narrow Diamond)',
  shortCode: '4-4-2 ND',
  description: 'Compact midfield diamond with a single pivot and advanced playmaker behind two strikers.',
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
      coordinates: { x: 80, y: 25 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'mid_dm',
      label: 'Defensive Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 50, y: 42 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_lcm',
      label: 'Left Central Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 39, y: 54 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_rcm',
      label: 'Right Central Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 61, y: 54 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_am',
      label: 'Attacking Midfielder',
      preferredPosition: Position.MIDFIELDER,
      coordinates: { x: 50, y: 66 },
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
