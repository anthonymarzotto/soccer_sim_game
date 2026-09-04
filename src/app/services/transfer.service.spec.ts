import { TestBed } from '@angular/core/testing';
import { TransferService } from './transfer.service';

describe('TransferService', () => {
  let service: TransferService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TransferService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getTransferWindowPhase', () => {
    it('should return summer for weeks 52 and 1 through 6', () => {
      expect(service.getTransferWindowPhase(52)).toBe('summer');
      expect(service.getTransferWindowPhase(1)).toBe('summer');
      expect(service.getTransferWindowPhase(3)).toBe('summer');
      expect(service.getTransferWindowPhase(6)).toBe('summer');
    });

    it('should return winter for weeks 26 through 29', () => {
      expect(service.getTransferWindowPhase(26)).toBe('winter');
      expect(service.getTransferWindowPhase(27)).toBe('winter');
      expect(service.getTransferWindowPhase(29)).toBe('winter');
    });

    it('should return post_season for weeks 49 and 50', () => {
      expect(service.getTransferWindowPhase(49)).toBe('post_season');
      expect(service.getTransferWindowPhase(50)).toBe('post_season');
    });

    it('should return closed for fixture and rollover weeks', () => {
      expect(service.getTransferWindowPhase(7)).toBe('closed');
      expect(service.getTransferWindowPhase(25)).toBe('closed');
      expect(service.getTransferWindowPhase(30)).toBe('closed');
      expect(service.getTransferWindowPhase(48)).toBe('closed');
      expect(service.getTransferWindowPhase(51)).toBe('closed');
    });
  });

  describe('getWeeksRemainingInWindow', () => {
    it('should return correct countdown during summer window (weeks 52, 1-6)', () => {
      expect(service.getWeeksRemainingInWindow(52)).toBe(7);
      expect(service.getWeeksRemainingInWindow(1)).toBe(6);
      expect(service.getWeeksRemainingInWindow(6)).toBe(1);
    });

    it('should return correct countdown during winter window (weeks 26-29)', () => {
      expect(service.getWeeksRemainingInWindow(26)).toBe(4);
      expect(service.getWeeksRemainingInWindow(29)).toBe(1);
    });

    it('should return correct countdown during post_season window (weeks 49-50)', () => {
      expect(service.getWeeksRemainingInWindow(49)).toBe(2);
      expect(service.getWeeksRemainingInWindow(50)).toBe(1);
    });

    it('should return 0 when transfer window is closed', () => {
      expect(service.getWeeksRemainingInWindow(7)).toBe(0);
      expect(service.getWeeksRemainingInWindow(25)).toBe(0);
      expect(service.getWeeksRemainingInWindow(51)).toBe(0);
    });
  });

  describe('getCalendarWeekInfo', () => {
    it('should return pre_season with no matches for weeks 1 through 6', () => {
      const info = service.getCalendarWeekInfo(1);
      expect(info.phase).toBe('pre_season');
      expect(info.phaseLabel).toBe('Pre-Season');
      expect(info.hasMatches).toBeFalse();
      expect(info.nextMatchWeek).toBe(7);
    });

    it('should return regular_season_1 with matchday calculation for weeks 7 through 25', () => {
      const infoW7 = service.getCalendarWeekInfo(7);
      expect(infoW7.phase).toBe('regular_season_1');
      expect(infoW7.hasMatches).toBeTrue();
      expect(infoW7.matchdayRound).toBe(1);

      const infoW25 = service.getCalendarWeekInfo(25);
      expect(infoW25.phase).toBe('regular_season_1');
      expect(infoW25.hasMatches).toBeTrue();
      expect(infoW25.matchdayRound).toBe(19);
    });

    it('should return winter_break with no matches for weeks 26 through 29', () => {
      const info = service.getCalendarWeekInfo(26);
      expect(info.phase).toBe('winter_break');
      expect(info.phaseLabel).toBe('Winter Break');
      expect(info.hasMatches).toBeFalse();
      expect(info.nextMatchWeek).toBe(30);
    });

    it('should return regular_season_2 with matchday calculation for weeks 30 through 48', () => {
      const infoW30 = service.getCalendarWeekInfo(30);
      expect(infoW30.phase).toBe('regular_season_2');
      expect(infoW30.hasMatches).toBeTrue();
      expect(infoW30.matchdayRound).toBe(20);

      const infoW48 = service.getCalendarWeekInfo(48);
      expect(infoW48.phase).toBe('regular_season_2');
      expect(infoW48.hasMatches).toBeTrue();
      expect(infoW48.matchdayRound).toBe(38);
    });

    it('should return post_season for weeks 49 and 50', () => {
      const info = service.getCalendarWeekInfo(49);
      expect(info.phase).toBe('post_season');
      expect(info.hasMatches).toBeFalse();
    });

    it('should return off_season for week 51 rollover and week 52 kickoff', () => {
      const infoW51 = service.getCalendarWeekInfo(51);
      expect(infoW51.phase).toBe('off_season');
      expect(infoW51.phaseLabel).toBe('Season Rollover');
      expect(infoW51.hasMatches).toBeFalse();

      const infoW52 = service.getCalendarWeekInfo(52);
      expect(infoW52.phase).toBe('off_season');
      expect(infoW52.hasMatches).toBeFalse();
    });
  });

  describe('hasMatchesInWeek', () => {
    it('should return false for pre-season, winter break, and off-season weeks', () => {
      expect(service.hasMatchesInWeek(1)).toBeFalse();
      expect(service.hasMatchesInWeek(6)).toBeFalse();
      expect(service.hasMatchesInWeek(26)).toBeFalse();
      expect(service.hasMatchesInWeek(29)).toBeFalse();
      expect(service.hasMatchesInWeek(49)).toBeFalse();
      expect(service.hasMatchesInWeek(51)).toBeFalse();
      expect(service.hasMatchesInWeek(52)).toBeFalse();
    });

    it('should return true for regular season weeks (7-25 and 30-48)', () => {
      expect(service.hasMatchesInWeek(7)).toBeTrue();
      expect(service.hasMatchesInWeek(25)).toBeTrue();
      expect(service.hasMatchesInWeek(30)).toBeTrue();
      expect(service.hasMatchesInWeek(48)).toBeTrue();
    });
  });
});
