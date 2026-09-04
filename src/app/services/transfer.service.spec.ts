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
});
