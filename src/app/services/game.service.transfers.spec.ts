import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { GameService } from './game.service';
import { GeneratorService } from './generator.service';
import { MatchSimulationVariantBService } from './match.simulation.variant-b.service';
import { CommentaryService } from './commentary.service';
import { StatisticsService } from './statistics.service';
import { PostMatchAnalysisService } from './post.match.analysis.service';
import { FieldService } from './field.service';
import { FormationLibraryService } from './formation-library.service';
import { PersistenceService } from './persistence.service';
import { DataSchemaVersionService } from './data-schema-version.service';
import { NormalizedDbService } from './normalized-db.service';
import { RngService } from './rng.service';
import { Position, Role } from '../models/enums';
import { League, Team, Player, TransferOffer } from '../models/types';
import { createTestPlayer } from '../testing/test-player-fixtures';
import { calculatePlayerWageCost, calculateMarketValue } from '../models/player-progression';

describe('GameService — Transfer Offer Sub-System', () => {
  function makeTeam(id: string, players: Player[], budget = 10000000, wageCap = 65, wageUsed = 0, name = 'Test Team'): Team {
    return {
      id,
      name,
      players,
      playerIds: players.map(p => p.id),
      stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] },
      selectedFormationId: 'formation_4_4_2',
      finances: { tier: 3, transferBudget: budget, wagePointsCap: wageCap, wagePointsUsed: wageUsed },
      formationAssignments: {},
      seasonSnapshots: [{
        seasonYear: 2026,
        playerIds: players.map(p => p.id),
        stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] }
      }]
    };
  }

  function makeLeague(teams: Team[], userTeamId?: string, transferOffers: TransferOffer[] = []): League {
    return {
      userTeamId,
      teams,
      schedule: [],
      currentWeek: 1,
      currentSeasonYear: 2026,
      transferListings: [],
      transferOffers
    };
  }

  interface SetupOptions {
    league?: League;
    rngRandomValue?: number;
  }

  function setup(options: SetupOptions = {}) {
    TestBed.resetTestingModule();

    const initialLeague = options.league || null;

    const generatorSpy = {
      generateLeague: vi.fn(),
      generateScheduleForSeason: vi.fn(),
      generatePlayer: vi.fn()
    };

    const persistenceSpy = {
      loadLeague: vi.fn().mockResolvedValue(initialLeague),
      saveLeague: vi.fn().mockResolvedValue(undefined),
      clearLeague: vi.fn().mockResolvedValue(undefined),
      saveLeagueMetadata: vi.fn().mockResolvedValue(undefined),
      saveTeam: vi.fn().mockResolvedValue(undefined),
      saveTeamDefinition: vi.fn().mockResolvedValue(undefined),
      saveMatch: vi.fn().mockResolvedValue(undefined),
      saveMatchResult: vi.fn().mockResolvedValue(undefined),
      loadSeasonTransitionLog: vi.fn().mockResolvedValue(null),
      saveSeasonTransitionLog: vi.fn().mockResolvedValue(undefined)
    };

    const normalizedDbSpy = {
      saveTransfer: vi.fn().mockResolvedValue(undefined),
      saveLeague: vi.fn().mockResolvedValue(undefined),
      saveLeagueMetadata: vi.fn().mockResolvedValue(undefined)
    };

    const rngSpy = {
      random: vi.fn().mockReturnValue(options.rngRandomValue ?? 0.5),
      beginSimulation: vi.fn(),
      nextUUID: vi.fn().mockReturnValue('mock-uuid')
    };

    const formationLibrarySpy = {
      getFormationSlots: vi.fn().mockReturnValue([
        { slotId: 'gk_1', preferredPosition: Position.GOALKEEPER },
        { slotId: 'def_1', preferredPosition: Position.DEFENDER },
        { slotId: 'def_2', preferredPosition: Position.DEFENDER },
        { slotId: 'def_3', preferredPosition: Position.DEFENDER },
        { slotId: 'mid_1', preferredPosition: Position.MIDFIELDER },
        { slotId: 'mid_2', preferredPosition: Position.MIDFIELDER },
        { slotId: 'mid_3', preferredPosition: Position.MIDFIELDER },
        { slotId: 'fwd_1', preferredPosition: Position.FORWARD },
        { slotId: 'fwd_2', preferredPosition: Position.FORWARD }
      ]),
      listPredefinedFormations: vi.fn().mockReturnValue([]),
      getAllFormations: vi.fn().mockReturnValue([]),
      getDefaultFormationId: vi.fn().mockReturnValue('formation_4_4_2')
    };

    const fieldServiceSpy = {
      validateFormationAssignments: vi.fn().mockReturnValue({ isValid: true, errors: [] })
    };

    TestBed.configureTestingModule({
      providers: [
        GameService,
        { provide: GeneratorService, useValue: generatorSpy as unknown as GeneratorService },
        { provide: PersistenceService, useValue: persistenceSpy as unknown as PersistenceService },
        { provide: NormalizedDbService, useValue: normalizedDbSpy as unknown as NormalizedDbService },
        { provide: RngService, useValue: rngSpy as unknown as RngService },
        { provide: FieldService, useValue: fieldServiceSpy as unknown as FieldService },
        { provide: FormationLibraryService, useValue: formationLibrarySpy as unknown as FormationLibraryService },
        { provide: MatchSimulationVariantBService, useValue: {} },
        { provide: CommentaryService, useValue: {} },
        { provide: StatisticsService, useValue: { generatePlayerStatistics: vi.fn().mockReturnValue([]) } },
        { provide: PostMatchAnalysisService, useValue: {} },
        {
          provide: DataSchemaVersionService,
          useValue: {
            hasPersistedDataSchemaVersionMismatch: signal(false).asReadonly()
          }
        }
      ]
    });

    const service = TestBed.inject(GameService);
    return { service, persistenceSpy, normalizedDbSpy, rngSpy };
  }

  afterEach(() => TestBed.resetTestingModule());

  describe('submitTransferOffer', () => {
    it('should validate budget and reject offer if buyer lacks transferBudget', async () => {
      const buyerPlayer = createTestPlayer({ id: 'buyer_p1', teamId: 'buyer_team', position: Position.MIDFIELDER });
      const sellerPlayer = createTestPlayer({ id: 'target_player', teamId: 'seller_team', position: Position.MIDFIELDER });
      const buyerTeam = makeTeam('buyer_team', [buyerPlayer], 500000); // Only 500k budget
      const sellerTeam = makeTeam('seller_team', [sellerPlayer, createTestPlayer({ id: 'seller_p2', teamId: 'seller_team', position: Position.MIDFIELDER })]);
      const league = makeLeague([buyerTeam, sellerTeam], 'buyer_team');

      const { service } = setup({ league });
      await service.ensureHydrated();

      const result = service.submitTransferOffer('target_player', 1000000); // 1M offer
      expect(result.success).toBe(false);
      expect(result.message).toContain('Insufficient transfer budget');
      expect(service.league()?.transferOffers?.length ?? 0).toBe(0);
    });

    it('should validate wage points headroom and reject if buyer has insufficient headroom', async () => {
      const buyerPlayer = createTestPlayer({ id: 'buyer_p1', teamId: 'buyer_team', position: Position.MIDFIELDER, defaultStat: 80 });
      // Calculate buyer wage points
      const buyerWage = calculatePlayerWageCost(buyerPlayer, 2026);
      const targetPlayer = createTestPlayer({ id: 'target_player', teamId: 'seller_team', position: Position.MIDFIELDER, defaultStat: 90 });
      
      const buyerTeam = makeTeam('buyer_team', [buyerPlayer], 10000000, 65, buyerWage); // Cap: 65, Used: buyerWage
      // Set cap to same as wage used, so 0 headroom
      buyerTeam.finances.wagePointsCap = buyerWage;
      
      const sellerTeam = makeTeam('seller_team', [targetPlayer, createTestPlayer({ id: 'seller_p2', teamId: 'seller_team', position: Position.MIDFIELDER })]);
      const league = makeLeague([buyerTeam, sellerTeam], 'buyer_team');

      const { service } = setup({ league });
      await service.ensureHydrated();

      const result = service.submitTransferOffer('target_player', 1000000);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Insufficient wage points headroom');
      expect(service.league()?.transferOffers?.length ?? 0).toBe(0);
    });

    it('should reject offer and save record as rejected if bid fee is below asking price (115% value)', async () => {
      const targetPlayer = createTestPlayer({ id: 'target_player', teamId: 'seller_team', position: Position.MIDFIELDER, defaultStat: 80 });
      const marketValue = calculateMarketValue(targetPlayer, 2026);
      const askingPrice = Math.round(marketValue * 1.15);
      const lowBid = askingPrice - 10000;

      const buyerPlayer = createTestPlayer({ id: 'buyer_p1', teamId: 'buyer_team', position: Position.MIDFIELDER });
      const buyerTeam = makeTeam('buyer_team', [buyerPlayer], 10000000, 100, 10);
      const sellerTeam = makeTeam('seller_team', [targetPlayer, createTestPlayer({ id: 'seller_p2', teamId: 'seller_team', position: Position.MIDFIELDER })]);
      const league = makeLeague([buyerTeam, sellerTeam], 'buyer_team');

      const { service } = setup({ league });
      await service.ensureHydrated();

      const result = service.submitTransferOffer('target_player', lowBid);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Offer rejected');
      expect(result.message).toContain(askingPrice.toLocaleString());
      
      const offers = service.league()?.transferOffers ?? [];
      expect(offers.length).toBe(1);
      expect(offers[0].status).toBe('rejected');
      expect(offers[0].fee).toBe(lowBid);
    });

    it('should reject offer and save record as rejected if seller lacks squad depth at the position', async () => {
      const targetPlayer = createTestPlayer({ id: 'target_player', teamId: 'seller_team', position: Position.MIDFIELDER, defaultStat: 80 });
      const marketValue = calculateMarketValue(targetPlayer, 2026);
      const askingPrice = Math.round(marketValue * 1.15);

      const buyerPlayer = createTestPlayer({ id: 'buyer_p1', teamId: 'buyer_team', position: Position.MIDFIELDER });
      const buyerTeam = makeTeam('buyer_team', [buyerPlayer], 10000000, 100, 10);
      
      // Seller team only has 3 midfielders. Midfielder limit is 3. If targetPlayer is sold, they have 2, which is < 3.
      const sellerTeam = makeTeam('seller_team', [
        targetPlayer,
        createTestPlayer({ id: 'seller_p2', teamId: 'seller_team', position: Position.MIDFIELDER }),
        createTestPlayer({ id: 'seller_p3', teamId: 'seller_team', position: Position.MIDFIELDER })
      ]);
      const league = makeLeague([buyerTeam, sellerTeam], 'buyer_team');

      const { service } = setup({ league });
      await service.ensureHydrated();

      const result = service.submitTransferOffer('target_player', askingPrice);
      expect(result.success).toBe(false);
      expect(result.message).toContain('do not have enough depth');
      
      const offers = service.league()?.transferOffers ?? [];
      expect(offers.length).toBe(1);
      expect(offers[0].status).toBe('rejected');
    });

    it('should atomically transfer player if offer meets criteria and CPU accepts', async () => {
      const targetPlayer = createTestPlayer({ id: 'target_player', teamId: 'seller_team', position: Position.MIDFIELDER, defaultStat: 80 });
      const marketValue = calculateMarketValue(targetPlayer, 2026);
      const askingPrice = Math.round(marketValue * 1.15);

      const buyerPlayer = createTestPlayer({ id: 'buyer_p1', teamId: 'buyer_team', position: Position.MIDFIELDER });
      const buyerTeam = makeTeam('buyer_team', [buyerPlayer], 10000000, 100, 10);
      
      // Seller team has 4 midfielders (limit 3, so they can sell 1)
      const sellerTeam = makeTeam('seller_team', [
        targetPlayer,
        createTestPlayer({ id: 'seller_p2', teamId: 'seller_team', position: Position.MIDFIELDER }),
        createTestPlayer({ id: 'seller_p3', teamId: 'seller_team', position: Position.MIDFIELDER }),
        createTestPlayer({ id: 'seller_p4', teamId: 'seller_team', position: Position.MIDFIELDER })
      ]);
      sellerTeam.formationAssignments = { mid_1: 'target_player', mid_2: 'seller_p2' };

      const league = makeLeague([buyerTeam, sellerTeam], 'buyer_team');

      const { service, normalizedDbSpy } = setup({ league });
      await service.ensureHydrated();

      const result = service.submitTransferOffer('target_player', askingPrice);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Offer accepted');

      const updatedLeague = service.league()!;
      
      // Check offer status
      const offers = updatedLeague.transferOffers;
      expect(offers.length).toBe(1);
      expect(offers[0].status).toBe('accepted');

      // Check atomic update: buyer budget reduced, seller budget increased
      const updatedBuyer = service.getTeam('buyer_team')!;
      const updatedSeller = service.getTeam('seller_team')!;
      expect(updatedBuyer.finances.transferBudget).toBe(10000000 - askingPrice);
      expect(updatedSeller.finances.transferBudget).toBe(10000000 + askingPrice);

      // Check player details: position moved, role is Bench, transferHistory appended
      const transferredPlayer = service.getPlayer('target_player')!;
      expect(transferredPlayer.teamId).toBe('buyer_team');
      expect(transferredPlayer.role).toBe(Role.BENCH);
      expect(transferredPlayer.transferHistory?.length).toBe(1);
      expect(transferredPlayer.transferHistory?.[0]).toMatchObject({
        sellerTeamId: 'seller_team',
        buyerTeamId: 'buyer_team',
        fee: askingPrice,
        seasonYear: 2026,
        week: 1
      });

      // Check lineup cleanup: player removed from seller's formationAssignments
      expect(updatedSeller.formationAssignments['mid_1']).toBeUndefined();
      expect(updatedSeller.formationAssignments['mid_2']).toBe('seller_p2');

      // Check wage points recalculation
      const expectedBuyerWage = Math.round((calculatePlayerWageCost(buyerPlayer, 2026) + calculatePlayerWageCost(targetPlayer, 2026)) * 100) / 100;
      expect(updatedBuyer.finances.wagePointsUsed).toBe(expectedBuyerWage);
      
      // Check atomic DB transaction save was called
      expect(normalizedDbSpy.saveTransfer).toHaveBeenCalledTimes(1);
    });
  });

  describe('acceptOffer and rejectOffer', () => {
    it('should allow user to accept a pending CPU offer on their player', async () => {
      const targetPlayer = createTestPlayer({ id: 'target_player', teamId: 'user_team', position: Position.MIDFIELDER, defaultStat: 80 });
      
      const userTeam = makeTeam('user_team', [targetPlayer, createTestPlayer({ id: 'user_p2', teamId: 'user_team', position: Position.MIDFIELDER })]);
      userTeam.formationAssignments = { mid_1: 'target_player' };
      
      const cpuTeam = makeTeam('cpu_team', [createTestPlayer({ id: 'cpu_p1', teamId: 'cpu_team', position: Position.MIDFIELDER })], 5000000, 100, 10);
      
      const offer: TransferOffer = {
        id: 'offer_1',
        buyerTeamId: 'cpu_team',
        sellerTeamId: 'user_team',
        playerId: 'target_player',
        fee: 2000000,
        week: 1,
        status: 'pending'
      };

      const league = makeLeague([userTeam, cpuTeam], 'user_team', [offer]);

      const { service, normalizedDbSpy } = setup({ league });
      await service.ensureHydrated();

      service.acceptOffer('offer_1');

      const updatedLeague = service.league()!;
      expect(updatedLeague.transferOffers[0].status).toBe('accepted');
      
      const updatedUser = service.getTeam('user_team')!;
      const updatedCpu = service.getTeam('cpu_team')!;
      
      expect(updatedUser.finances.transferBudget).toBe(12000000); // 10M initial + 2M fee
      expect(updatedCpu.finances.transferBudget).toBe(3000000); // 5M initial - 2M fee

      // Lineup cleaned up
      expect(updatedUser.formationAssignments['mid_1']).toBeUndefined();

      // Database write
      expect(normalizedDbSpy.saveTransfer).toHaveBeenCalledTimes(1);
    });

    it('should reject a pending CPU offer on user player', async () => {
      const targetPlayer = createTestPlayer({ id: 'target_player', teamId: 'user_team', position: Position.MIDFIELDER });
      const userTeam = makeTeam('user_team', [targetPlayer]);
      const cpuTeam = makeTeam('cpu_team', []);
      const offer: TransferOffer = {
        id: 'offer_1',
        buyerTeamId: 'cpu_team',
        sellerTeamId: 'user_team',
        playerId: 'target_player',
        fee: 2000000,
        week: 1,
        status: 'pending'
      };

      const league = makeLeague([userTeam, cpuTeam], 'user_team', [offer]);

      const { service, persistenceSpy } = setup({ league });
      await service.ensureHydrated();

      service.rejectOffer('offer_1');

      expect(service.league()?.transferOffers[0].status).toBe('rejected');
      expect(persistenceSpy.saveLeagueMetadata).toHaveBeenCalledTimes(1);
    });

    it('should auto-expire other offers for the player when one is accepted', async () => {
      const targetPlayer = createTestPlayer({ id: 'target_player', teamId: 'user_team', position: Position.MIDFIELDER });
      const userTeam = makeTeam('user_team', [targetPlayer, createTestPlayer({ id: 'user_p2', teamId: 'user_team', position: Position.MIDFIELDER })]);
      const cpuTeam1 = makeTeam('cpu_team1', [], 5000000, 100, 10);
      const cpuTeam2 = makeTeam('cpu_team2', [], 5000000, 100, 10);
      
      const offer1: TransferOffer = {
        id: 'offer_1', buyerTeamId: 'cpu_team1', sellerTeamId: 'user_team',
        playerId: 'target_player', fee: 2000000, week: 1, status: 'pending'
      };
      const offer2: TransferOffer = {
        id: 'offer_2', buyerTeamId: 'cpu_team2', sellerTeamId: 'user_team',
        playerId: 'target_player', fee: 2200000, week: 1, status: 'pending'
      };

      const league = makeLeague([userTeam, cpuTeam1, cpuTeam2], 'user_team', [offer1, offer2]);

      const { service } = setup({ league });
      await service.ensureHydrated();

      service.acceptOffer('offer_2');

      const offers = service.league()?.transferOffers ?? [];
      const o1 = offers.find(o => o.id === 'offer_1')!;
      const o2 = offers.find(o => o.id === 'offer_2')!;
      
      expect(o2.status).toBe('accepted');
      expect(o1.status).toBe('expired'); // Auto-expired
    });

    it('should expire other buyer pending offers if buyer no longer has budget/headroom', async () => {
      const playerA = createTestPlayer({ id: 'player_a', teamId: 'user_team', position: Position.MIDFIELDER });
      const playerB = createTestPlayer({ id: 'player_b', teamId: 'user_team', position: Position.MIDFIELDER });
      
      const userTeam = makeTeam('user_team', [playerA, playerB, createTestPlayer({ id: 'user_p3', teamId: 'user_team', position: Position.MIDFIELDER })]);
      
      // CPU team has 3,000,000 budget
      const cpuTeam = makeTeam('cpu_team', [], 3000000, 100, 10);
      
      // Offer for A is 2M, offer for B is 2M. CPU cannot afford both if one is accepted!
      const offerA: TransferOffer = {
        id: 'offer_a', buyerTeamId: 'cpu_team', sellerTeamId: 'user_team',
        playerId: 'player_a', fee: 2000000, week: 1, status: 'pending'
      };
      const offerB: TransferOffer = {
        id: 'offer_b', buyerTeamId: 'cpu_team', sellerTeamId: 'user_team',
        playerId: 'player_b', fee: 2000000, week: 1, status: 'pending'
      };

      const league = makeLeague([userTeam, cpuTeam], 'user_team', [offerA, offerB]);

      const { service } = setup({ league });
      await service.ensureHydrated();

      service.acceptOffer('offer_a');

      const offers = service.league()?.transferOffers ?? [];
      const oa = offers.find(o => o.id === 'offer_a')!;
      const ob = offers.find(o => o.id === 'offer_b')!;

      expect(oa.status).toBe('accepted');
      expect(ob.status).toBe('expired'); // CPU team now only has 1M budget left, so offer B is expired!
    });
  });

  describe('advanceWeek and offer generation', () => {
    it('should set all pending offers to expired if next week transfer window is closed', async () => {
      const offer: TransferOffer = {
        id: 'offer_1', buyerTeamId: 'cpu_team', sellerTeamId: 'user_team',
        playerId: 'p1', fee: 1000000, week: 3, status: 'pending'
      };
      
      const userTeam = makeTeam('user_team', []);
      const cpuTeam = makeTeam('cpu_team', []);
      const league = makeLeague([userTeam, cpuTeam], 'user_team', [offer]);
      // Week 3 is last week of summer transfer window, week 4 is closed.
      league.currentWeek = 3;

      const { service } = setup({ league });
      await service.ensureHydrated();

      service.advanceWeek();

      const updatedOffers = service.league()?.transferOffers ?? [];
      expect(updatedOffers.length).toBe(1);
      expect(updatedOffers[0].status).toBe('expired');
    });

    it('should generate CPU-to-User offers on user listed players based on non-cheating heuristics', async () => {
      // User listed player is OVR 85 Midfielder
      const userPlayer = createTestPlayer({ id: 'user_listed', teamId: 'user_team', position: Position.MIDFIELDER, defaultStat: 85 });
      const userTeam = makeTeam('user_team', [userPlayer]);
      
      // CPU team has a lower midfielder (OVR 70) and sufficient finances. This player improves them.
      const cpuMid = createTestPlayer({ id: 'cpu_mid', teamId: 'cpu_team', position: Position.MIDFIELDER, defaultStat: 70 });
      const cpuTeam = makeTeam('cpu_team', [cpuMid], 12000000, 100, 10);
      
      const league = makeLeague([userTeam, cpuTeam], 'user_team');
      league.transferListings = ['user_listed'];
      league.currentWeek = 1; // Summer window open

      // Mock RNG to trigger the 30% chance (say, 0.1)
      const { service } = setup({ league, rngRandomValue: 0.1 });
      await service.ensureHydrated();

      service.advanceWeek();

      const offers = service.league()?.transferOffers ?? [];
      expect(offers.length).toBe(1);
      expect(offers[0]).toMatchObject({
        buyerTeamId: 'cpu_team',
        sellerTeamId: 'user_team',
        playerId: 'user_listed',
        status: 'pending'
      });
      
      // Bid amount should be between 90% and 115% of market value
      const marketValue = calculateMarketValue(userPlayer, 2026);
      expect(offers[0].fee).toBeGreaterThanOrEqual(marketValue * 0.9);
      expect(offers[0].fee).toBeLessThanOrEqual(marketValue * 1.15);
    });

    it('should generate CPU-to-User offers on young prospects based on market value average improvement', async () => {
      // User listed player is a young prospect (age 19, OVR 75, High Market Value)
      const userPlayer = createTestPlayer({ id: 'prospect', teamId: 'user_team', position: Position.MIDFIELDER, age: 19, defaultStat: 75 });
      const userTeam = makeTeam('user_team', [userPlayer]);
      
      // CPU midfielders have low market value (OVR 65)
      const cpuMid = createTestPlayer({ id: 'cpu_mid', teamId: 'cpu_team', position: Position.MIDFIELDER, age: 28, defaultStat: 65 });
      const cpuTeam = makeTeam('cpu_team', [cpuMid], 15000000, 100, 10);
      
      const league = makeLeague([userTeam, cpuTeam], 'user_team');
      league.transferListings = ['prospect'];
      league.currentWeek = 1;

      // Mock RNG to trigger the 30% chance
      const { service } = setup({ league, rngRandomValue: 0.1 });
      await service.ensureHydrated();

      service.advanceWeek();

      const offers = service.league()?.transferOffers ?? [];
      expect(offers.length).toBe(1);
      expect(offers[0].playerId).toBe('prospect');
    });
  });

  describe('immediate CPU offer generation on listing', () => {
    it('should immediately evaluate and generate an offer when user lists a player', async () => {
      const userPlayer = createTestPlayer({ id: 'user_listed', teamId: 'user_team', position: Position.MIDFIELDER, defaultStat: 85 });
      const userTeam = makeTeam('user_team', [userPlayer]);
      const cpuMid = createTestPlayer({ id: 'cpu_mid', teamId: 'cpu_team', position: Position.MIDFIELDER, defaultStat: 70 });
      const cpuTeam = makeTeam('cpu_team', [cpuMid], 12000000, 100, 10);
      
      const league = makeLeague([userTeam, cpuTeam], 'user_team');
      league.currentWeek = 1; // Summer window open

      const { service } = setup({ league, rngRandomValue: 0.1 });
      await service.ensureHydrated();

      service.addPlayerToTransferList('user_listed');

      const offers = service.league()?.transferOffers ?? [];
      expect(offers.length).toBe(1);
      expect(offers[0]).toMatchObject({
        buyerTeamId: 'cpu_team',
        sellerTeamId: 'user_team',
        playerId: 'user_listed',
        status: 'pending'
      });

      const evaluated = service.league()?.evaluatedCpuOfferPlayerIds ?? [];
      expect(evaluated).toContain('user_listed');
    });

    it('should not generate a second offer if player is delisted and relisted in the same week', async () => {
      const userPlayer = createTestPlayer({ id: 'user_listed', teamId: 'user_team', position: Position.MIDFIELDER, defaultStat: 85 });
      const userTeam = makeTeam('user_team', [userPlayer]);
      const cpuMid = createTestPlayer({ id: 'cpu_mid', teamId: 'cpu_team', position: Position.MIDFIELDER, defaultStat: 70 });
      const cpuTeam = makeTeam('cpu_team', [cpuMid], 12000000, 100, 10);
      
      const league = makeLeague([userTeam, cpuTeam], 'user_team');
      league.currentWeek = 1;

      const { service } = setup({ league, rngRandomValue: 0.1 });
      await service.ensureHydrated();

      // First listing
      service.addPlayerToTransferList('user_listed');
      expect(service.league()?.transferOffers?.length).toBe(1);

      // Delist
      service.removePlayerFromTransferList('user_listed');

      // Relist
      service.addPlayerToTransferList('user_listed');
      // Offers should still be 1 (not duplicated)
      expect(service.league()?.transferOffers?.length).toBe(1);
    });

    it('should evaluate listed players on advanceWeek and prevent delist/relist in the new week', async () => {
      const userPlayer = createTestPlayer({ id: 'user_listed', teamId: 'user_team', position: Position.MIDFIELDER, defaultStat: 85 });
      const userTeam = makeTeam('user_team', [userPlayer]);
      const cpuMid = createTestPlayer({ id: 'cpu_mid', teamId: 'cpu_team', position: Position.MIDFIELDER, defaultStat: 70 });
      const cpuTeam = makeTeam('cpu_team', [cpuMid], 12000000, 100, 10);
      
      const league = makeLeague([userTeam, cpuTeam], 'user_team');
      league.transferListings = ['user_listed'];
      league.currentWeek = 1;

      const { service } = setup({ league, rngRandomValue: 0.1 });
      await service.ensureHydrated();

      service.advanceWeek();

      // New week evaluation generated an offer
      expect(service.league()?.transferOffers?.length).toBe(1);
      expect(service.league()?.currentWeek).toBe(2);
      expect(service.league()?.evaluatedCpuOfferPlayerIds).toContain('user_listed');

      // Attempting to delist/relist in Week 2 should not generate another offer
      service.removePlayerFromTransferList('user_listed');
      service.addPlayerToTransferList('user_listed');
      expect(service.league()?.transferOffers?.length).toBe(1);
    });
  });
});
