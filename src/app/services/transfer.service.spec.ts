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
    it('should return summer for weeks 1, 2, and 3', () => {
      expect(service.getTransferWindowPhase(1)).toBe('summer');
      expect(service.getTransferWindowPhase(2)).toBe('summer');
      expect(service.getTransferWindowPhase(3)).toBe('summer');
    });

    it('should return winter for weeks 20, 21, and 22', () => {
      expect(service.getTransferWindowPhase(20)).toBe('winter');
      expect(service.getTransferWindowPhase(21)).toBe('winter');
      expect(service.getTransferWindowPhase(22)).toBe('winter');
    });

    it('should return closed for other weeks', () => {
      expect(service.getTransferWindowPhase(4)).toBe('closed');
      expect(service.getTransferWindowPhase(10)).toBe('closed');
      expect(service.getTransferWindowPhase(19)).toBe('closed');
      expect(service.getTransferWindowPhase(23)).toBe('closed');
      expect(service.getTransferWindowPhase(30)).toBe('closed');
    });
  });

  describe('getWeeksRemainingInWindow', () => {
    it('should return correct countdown during summer window (weeks 1-3)', () => {
      expect(service.getWeeksRemainingInWindow(1)).toBe(3);
      expect(service.getWeeksRemainingInWindow(2)).toBe(2);
      expect(service.getWeeksRemainingInWindow(3)).toBe(1);
    });

    it('should return correct countdown during winter window (weeks 20-22)', () => {
      expect(service.getWeeksRemainingInWindow(20)).toBe(3);
      expect(service.getWeeksRemainingInWindow(21)).toBe(2);
      expect(service.getWeeksRemainingInWindow(22)).toBe(1);
    });

    it('should return 0 when transfer window is closed', () => {
      expect(service.getWeeksRemainingInWindow(4)).toBe(0);
      expect(service.getWeeksRemainingInWindow(10)).toBe(0);
      expect(service.getWeeksRemainingInWindow(23)).toBe(0);
    });
  });
});
