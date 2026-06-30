import { FieldZone, Position } from '../../models/enums';
import { FormationSchema } from '../../models/formation.types';

export const FORMATION_SPINE_OVERLOAD: FormationSchema = {
  id: 'formation_spine_overload',
  name: 'The Spine Overload',
  shortCode: '1-2-4-4',
  description: 'A dev-only, ultra-narrow formation stacked centrally to exploit simulation physics.',
  isUserDefined: false,
  isDevOnly: true,
  createdAt: 0,
  slots: [
    {
      slotId: 'gk_1',
      label: 'Goalkeeper',
      preferredPosition: Position.GK,
      coordinates: { x: 50, y: 5 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'def_cb1',
      label: 'Lower Center-Back',
      preferredPosition: Position.CB,
      coordinates: { x: 50, y: 20 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'def_cb2',
      label: 'Upper Center-Back',
      preferredPosition: Position.CB,
      coordinates: { x: 50, y: 30 },
      zone: FieldZone.DEFENSE
    },
    {
      slotId: 'mid_cdm',
      label: 'Defensive Midfielder',
      preferredPosition: Position.CDM,
      coordinates: { x: 50, y: 40 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_cm1',
      label: 'Central Midfielder Left',
      preferredPosition: Position.CM,
      coordinates: { x: 44, y: 48 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_cm2',
      label: 'Central Midfielder Right',
      preferredPosition: Position.CM,
      coordinates: { x: 56, y: 48 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'mid_cam',
      label: 'Attacking Midfielder',
      preferredPosition: Position.CAM,
      coordinates: { x: 50, y: 64 },
      zone: FieldZone.MIDFIELD
    },
    {
      slotId: 'att_st1',
      label: 'Target Striker',
      preferredPosition: Position.ST,
      coordinates: { x: 50, y: 78 },
      zone: FieldZone.ATTACK
    },
    {
      slotId: 'att_st2',
      label: 'Inside-Left Striker',
      preferredPosition: Position.ST,
      coordinates: { x: 44, y: 84 },
      zone: FieldZone.ATTACK
    },
    {
      slotId: 'att_st3',
      label: 'Inside-Right Striker',
      preferredPosition: Position.ST,
      coordinates: { x: 56, y: 84 },
      zone: FieldZone.ATTACK
    },
    {
      slotId: 'att_st4',
      label: 'Advanced Striker',
      preferredPosition: Position.ST,
      coordinates: { x: 50, y: 92 },
      zone: FieldZone.ATTACK
    }
  ]
};
