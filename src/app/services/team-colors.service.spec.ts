import { TestBed } from '@angular/core/testing';
import { TeamColorsService } from './team-colors.service';
import { describe, it, expect, beforeEach } from 'vitest';

describe('TeamColorsService', () => {
  let service: TeamColorsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TeamColorsService]
    });
    service = TestBed.inject(TeamColorsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getPalette', () => {
    it('should return default fallback palette for null, undefined, or empty teamName', () => {
      const fallbackPalette = {
        badgeClass: "bg-zinc-700",
        textClass: "text-zinc-400",
        borderClass: "border-zinc-500",
        solidHex: "#3f3f46",
        secondaryHex: "#52525b",
        gradient: { from: "#52525b", to: "#18181b" },
      };

      expect(service.getPalette(null)).toEqual(fallbackPalette);
      expect(service.getPalette(undefined)).toEqual(fallbackPalette);
      expect(service.getPalette('')).toEqual(fallbackPalette);
    });

    it('should return predefined palette for known teams', () => {
      // Arsenal (index 0)
      const arsenalPalette = service.getPalette('Arsenal');
      expect(arsenalPalette.badgeClass).toBe('bg-red-600');
      expect(arsenalPalette.solidHex).toBe('#dc2626');

      // Chelsea (index 1)
      const chelseaPalette = service.getPalette('Chelsea');
      expect(chelseaPalette.badgeClass).toBe('bg-blue-600');
      expect(chelseaPalette.solidHex).toBe('#2563eb');
    });

    it('should return deterministically hashed palette for unknown teams', () => {
      const customTeam1 = service.getPalette('Custom Team A');
      const customTeam2 = service.getPalette('Custom Team B');
      const customTeam1Again = service.getPalette('Custom Team A');

      // It should be consistent
      expect(customTeam1).toEqual(customTeam1Again);
      // It should be drawn from the 20 distinct palettes (so badgeClass should start with 'bg-')
      expect(customTeam1.badgeClass).toMatch(/^bg-[a-z]+-600$/);
      expect(customTeam2.badgeClass).toMatch(/^bg-[a-z]+-600$/);
    });
  });

  describe('getTeamColors', () => {
    it('should return main and accent colors correctly for known team', () => {
      const colors = service.getTeamColors('Arsenal');
      // palette[0] has solidHex: '#dc2626', secondaryHex: '#0891b2'
      expect(colors).toEqual({
        main: '#dc2626',
        accent: '#0891b2'
      });
    });

    it('should return main and accent colors correctly for fallback (null)', () => {
      const colors = service.getTeamColors(null);
      // fallback palette has solidHex: '#3f3f46', secondaryHex: '#52525b'
      expect(colors).toEqual({
        main: '#3f3f46',
        accent: '#52525b'
      });
    });

    it('should return main and accent colors for unknown team', () => {
      const colors = service.getTeamColors('Some Unknown FC');
      expect(colors.main).toMatch(/^#[0-9a-f]{6}$/);
      expect(colors.accent).toMatch(/^#[0-9a-f]{6}$/);
    });
  });
});
