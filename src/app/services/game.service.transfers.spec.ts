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
    rngValues?: number[];
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

    let rngCallIndex = 0;
    const rngSpy = {
      random: options.rngValues
        ? vi.fn().mockImplementation(() => options.rngValues![rngCallIndex++] ?? options.rngRandomValue ?? 0.5)
        : vi.fn().mockReturnValue(options.rngRandomValue ?? 0.5),
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
      league.transferListings = [targetPlayer.id]; // player is listed

      const { service } = setup({ league });
      await service.ensureHydrated();

      const result = service.submitTransferOffer('target_player', lowBid);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Offer rejected');
      expect(result.message).toContain('requires a higher fee for this listed player');
      
      const offers = service.league()?.transferOffers ?? [];
      expect(offers.length).toBe(1);
      expect(offers[0].status).toBe('rejected');
      expect(offers[0].fee).toBe(lowBid);
    });

    it('should reject unlisted player offer and apply role-based starter premium (e.g., 1.40x to 1.60x)', async () => {
      const targetPlayer = createTestPlayer({ id: 'target_player', teamId: 'seller_team', position: Position.MIDFIELDER, defaultStat: 80 });
      const seller_p2 = createTestPlayer({ id: 'seller_p2', teamId: 'seller_team', position: Position.MIDFIELDER, defaultStat: 70 });
      const seller_p3 = createTestPlayer({ id: 'seller_p3', teamId: 'seller_team', position: Position.MIDFIELDER, defaultStat: 60 });
      const seller_p4 = createTestPlayer({ id: 'seller_p4', teamId: 'seller_team', position: Position.MIDFIELDER, defaultStat: 60 });
      
      const buyerPlayer = createTestPlayer({ id: 'buyer_p1', teamId: 'buyer_team', position: Position.MIDFIELDER });
      const buyerTeam = makeTeam('buyer_team', [buyerPlayer], 10000000, 100, 10);
      const sellerTeam = makeTeam('seller_team', [targetPlayer, seller_p2, seller_p3, seller_p4]);
      const league = makeLeague([buyerTeam, sellerTeam], 'buyer_team'); // player is unlisted

      const { service } = setup({ league });
      await service.ensureHydrated();

      // targetPlayer is unlisted, overall 80 (highest starter midfielder).
      // Multiplier should be 1.60x.
      const marketValue = calculateMarketValue(targetPlayer, 2026);
      const expectedAskingPrice = Math.round(marketValue * 1.60);

      // Offer slightly below the 1.60x asking price
      const bid = expectedAskingPrice - 10000;
      const result = service.submitTransferOffer('target_player', bid);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Offer rejected');
      expect(result.message).toContain('not looking to sell this player');
      
      // Try again with exact asking price (should be accepted)
      const acceptResult = service.submitTransferOffer('target_player', expectedAskingPrice);
      expect(acceptResult.success).toBe(true);
      expect(acceptResult.message).toContain('Offer accepted');
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
      league.transferListings = [targetPlayer.id];

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
      league.transferListings = [targetPlayer.id];

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
      expect(updatedSeller.finances.transferBudget).toBe(10000000 + Math.round(askingPrice * 0.9));

      // Check player details: position moved, role is Reserve, transferHistory appended
      const transferredPlayer = service.getPlayer('target_player')!;
      expect(transferredPlayer.teamId).toBe('buyer_team');
      expect(transferredPlayer.role).toBe(Role.RESERVE);
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
      
      expect(updatedUser.finances.transferBudget).toBe(11800000); // 10M initial + 1.8M fee (2M * 0.9)
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

  describe('CPU-to-CPU transfers', () => {
    it('should not run CPU-to-CPU transfers outside the transfer window', async () => {
      const userTeam = makeTeam('user_team', []);
      const buyerTeam = makeTeam('cpu_buyer', [
        createTestPlayer({ id: 'buyer_p1', teamId: 'cpu_buyer', position: Position.MIDFIELDER })
      ]);
      const sellerTeam = makeTeam('cpu_seller', [
        createTestPlayer({ id: 'seller_p1', teamId: 'cpu_seller', position: Position.MIDFIELDER }),
        createTestPlayer({ id: 'seller_p2', teamId: 'cpu_seller', position: Position.MIDFIELDER }),
        createTestPlayer({ id: 'seller_p3', teamId: 'cpu_seller', position: Position.MIDFIELDER }),
        createTestPlayer({ id: 'seller_p4', teamId: 'cpu_seller', position: Position.MIDFIELDER })
      ]);
      const league = makeLeague([userTeam, buyerTeam, sellerTeam], 'user_team');
      league.currentWeek = 4; // Transfer window closed
      league.transferListings = ['seller_p1'];

      // Mock RNG to make sure activity check would pass (random < 0.4, e.g. 0.1)
      const { service } = setup({ league, rngRandomValue: 0.1 });
      await service.ensureHydrated();

      service.simulateCurrentWeek();

      // Since window is closed, no transfers should occur
      expect(service.league()?.transferOffers?.length ?? 0).toBe(0);
    });

    it('should execute CPU-to-CPU transfer when conditions are met', async () => {
      const userTeam = makeTeam('user_team', []);
      
      // Buyer has a midfielder depth deficit (only 1 player, default formation needs 3)
      const buyerTeam = makeTeam('cpu_buyer', [
        createTestPlayer({ id: 'buyer_p1', teamId: 'cpu_buyer', position: Position.MIDFIELDER, defaultStat: 80 })
      ], 20000000);
      
      // Seller has surplus midfielders (4 players)
      const sellerMid1 = createTestPlayer({ id: 'seller_p1', teamId: 'cpu_seller', position: Position.MIDFIELDER, defaultStat: 85 });
      const sellerTeam = makeTeam('cpu_seller', [
        sellerMid1,
        createTestPlayer({ id: 'seller_p2', teamId: 'cpu_seller', position: Position.MIDFIELDER, defaultStat: 75 }),
        createTestPlayer({ id: 'seller_p3', teamId: 'cpu_seller', position: Position.MIDFIELDER, defaultStat: 75 }),
        createTestPlayer({ id: 'seller_p4', teamId: 'cpu_seller', position: Position.MIDFIELDER, defaultStat: 75 })
      ]);

      // Ensure seller team has > 15 players overall for the safety roster limit
      for (let i = 5; i <= 17; i++) {
        sellerTeam.players.push(createTestPlayer({ id: `seller_p${i}`, teamId: 'cpu_seller', position: Position.DEFENDER }));
      }
      sellerTeam.playerIds = sellerTeam.players.map(p => p.id);
      sellerTeam.seasonSnapshots![0].playerIds = sellerTeam.playerIds;

      const league = makeLeague([userTeam, buyerTeam, sellerTeam], 'user_team');
      league.currentWeek = 1; // Summer window open
      league.transferListings = ['seller_p1'];

      // Mock RNG: activity check (random < 0.4, e.g. 0.1)
      const { service } = setup({ league, rngRandomValue: 0.1 });
      await service.ensureHydrated();

      service.simulateCurrentWeek();

      const updatedOffers = service.league()?.transferOffers ?? [];
      expect(updatedOffers.length).toBe(1);
      expect(updatedOffers[0].status).toBe('accepted');
      expect(updatedOffers[0].buyerTeamId).toBe('cpu_buyer');
      expect(updatedOffers[0].sellerTeamId).toBe('cpu_seller');
      expect(updatedOffers[0].playerId).toBe('seller_p1');

      const transferredPlayer = service.getPlayer('seller_p1')!;
      expect(transferredPlayer.teamId).toBe('cpu_buyer');
      
      // Ensure listing recalculation removed him from listings
      expect(service.league()?.transferListings).not.toContain('seller_p1');
    });

    it('should respect the buy caps (summer = 2, winter = 1)', async () => {
      const userTeam = makeTeam('user_team', []);
      
      // Buyer has a midfielder depth deficit and huge budget
      const buyerTeam = makeTeam('cpu_buyer', [
        createTestPlayer({ id: 'buyer_p1', teamId: 'cpu_buyer', position: Position.MIDFIELDER, defaultStat: 80 })
      ], 50000000);
      
      // Seller has surplus midfielders and plenty of players
      const sellerTeam = makeTeam('cpu_seller', [
        createTestPlayer({ id: 'seller_p1', teamId: 'cpu_seller', position: Position.MIDFIELDER, defaultStat: 85 }),
        createTestPlayer({ id: 'seller_p2', teamId: 'cpu_seller', position: Position.MIDFIELDER, defaultStat: 85 }),
        createTestPlayer({ id: 'seller_p3', teamId: 'cpu_seller', position: Position.MIDFIELDER, defaultStat: 85 }),
        createTestPlayer({ id: 'seller_p4', teamId: 'cpu_seller', position: Position.MIDFIELDER, defaultStat: 85 }),
        createTestPlayer({ id: 'seller_p5', teamId: 'cpu_seller', position: Position.MIDFIELDER, defaultStat: 85 }),
        createTestPlayer({ id: 'seller_p6', teamId: 'cpu_seller', position: Position.MIDFIELDER, defaultStat: 85 })
      ]);
      for (let i = 7; i <= 20; i++) {
        sellerTeam.players.push(createTestPlayer({ id: `seller_p${i}`, teamId: 'cpu_seller', position: Position.DEFENDER }));
      }
      sellerTeam.playerIds = sellerTeam.players.map(p => p.id);
      sellerTeam.seasonSnapshots![0].playerIds = sellerTeam.playerIds;

      const league = makeLeague([userTeam, buyerTeam, sellerTeam], 'user_team');
      league.currentWeek = 20; // Winter window open (max buys = 1)
      league.transferListings = ['seller_p1', 'seller_p2', 'seller_p3'];

      // Mock RNG: activity check (random < 0.4, e.g. 0.1)
      const { service } = setup({ league, rngRandomValue: 0.1 });
      await service.ensureHydrated();

      service.simulateCurrentWeek();

      // Only 1 trade should be allowed in winter window for this buyer
      const updatedOffers = service.league()?.transferOffers ?? [];
      expect(updatedOffers.length).toBe(1);
    });

    it('should respect the seller minimum roster size safety floor (15 players)', async () => {
      const userTeam = makeTeam('user_team', []);
      
      const buyerTeam = makeTeam('cpu_buyer', [
        createTestPlayer({ id: 'buyer_p1', teamId: 'cpu_buyer', position: Position.MIDFIELDER, defaultStat: 80 })
      ], 15000000);
      
      // Seller team only has 14 players overall (below the 15-player safety floor)
      const sellerTeam = makeTeam('cpu_seller', [
        createTestPlayer({ id: 'seller_p1', teamId: 'cpu_seller', position: Position.MIDFIELDER, defaultStat: 85 }),
        createTestPlayer({ id: 'seller_p2', teamId: 'cpu_seller', position: Position.MIDFIELDER, defaultStat: 75 }),
        createTestPlayer({ id: 'seller_p3', teamId: 'cpu_seller', position: Position.MIDFIELDER, defaultStat: 75 }),
        createTestPlayer({ id: 'seller_p4', teamId: 'cpu_seller', position: Position.MIDFIELDER, defaultStat: 75 })
      ]);
      for (let i = 5; i <= 14; i++) {
        sellerTeam.players.push(createTestPlayer({ id: `seller_p${i}`, teamId: 'cpu_seller', position: Position.DEFENDER }));
      }
      sellerTeam.playerIds = sellerTeam.players.map(p => p.id);
      sellerTeam.seasonSnapshots![0].playerIds = sellerTeam.playerIds;

      const league = makeLeague([userTeam, buyerTeam, sellerTeam], 'user_team');
      league.currentWeek = 1; // Summer window
      league.transferListings = ['seller_p1'];

      // Mock RNG: activity check (random < 0.4, e.g. 0.1)
      const { service } = setup({ league, rngRandomValue: 0.1 });
      await service.ensureHydrated();

      service.simulateCurrentWeek();

      // Seller roster size is 14 <= 15 (min roster size is 15 to sell), so no transfer
      expect(service.league()?.transferOffers?.length ?? 0).toBe(0);
    });

    it('should allow buying a young prospect based on market value even if they do not exceed OVR floor', async () => {
      const userTeam = makeTeam('user_team', []);
      
      // Buyer has midfielders with OVR 85, so OVR floor is 85.
      const buyerTeam = makeTeam('cpu_buyer', [
        createTestPlayer({ id: 'buyer_p1', teamId: 'cpu_buyer', position: Position.MIDFIELDER, defaultStat: 85 })
      ], 20000000);
      
      // Candidate is age 19, OVR 70, but has high potential/value (market value is high)
      const youngProspect = createTestPlayer({ id: 'prospect', teamId: 'cpu_seller', position: Position.MIDFIELDER, age: 19, defaultStat: 70 });
      const sellerTeam = makeTeam('cpu_seller', [
        youngProspect,
        createTestPlayer({ id: 'seller_p2', teamId: 'cpu_seller', position: Position.MIDFIELDER, defaultStat: 75 }),
        createTestPlayer({ id: 'seller_p3', teamId: 'cpu_seller', position: Position.MIDFIELDER, defaultStat: 75 }),
        createTestPlayer({ id: 'seller_p4', teamId: 'cpu_seller', position: Position.MIDFIELDER, defaultStat: 75 })
      ]);
      for (let i = 5; i <= 18; i++) {
        sellerTeam.players.push(createTestPlayer({ id: `seller_p${i}`, teamId: 'cpu_seller', position: Position.DEFENDER }));
      }
      sellerTeam.playerIds = sellerTeam.players.map(p => p.id);
      sellerTeam.seasonSnapshots![0].playerIds = sellerTeam.playerIds;

      const league = makeLeague([userTeam, buyerTeam, sellerTeam], 'user_team');
      league.currentWeek = 1;
      league.transferListings = ['prospect'];

      // Mock RNG: activity check (random < 0.4, e.g. 0.1)
      const { service } = setup({ league, rngRandomValue: 0.1 });
      await service.ensureHydrated();

      service.simulateCurrentWeek();

      // Buyer team should buy the young prospect since they represent a prospect improvement
      const updatedOffers = service.league()?.transferOffers ?? [];
      expect(updatedOffers.length).toBe(1);
      expect(updatedOffers[0].playerId).toBe('prospect');
    });

    it('should persist recalculated transfer listings after CPU-to-CPU transfer', async () => {
      const userTeam = makeTeam('user_team', []);
      const buyerTeam = makeTeam('cpu_buyer', [
        createTestPlayer({ id: 'buyer_p1', teamId: 'cpu_buyer', position: Position.MIDFIELDER, defaultStat: 80 })
      ], 20000000);
      const sellerMid1 = createTestPlayer({ id: 'seller_p1', teamId: 'cpu_seller', position: Position.MIDFIELDER, defaultStat: 85 });
      const sellerTeam = makeTeam('cpu_seller', [
        sellerMid1,
        createTestPlayer({ id: 'seller_p2', teamId: 'cpu_seller', position: Position.MIDFIELDER, defaultStat: 75 }),
        createTestPlayer({ id: 'seller_p3', teamId: 'cpu_seller', position: Position.MIDFIELDER, defaultStat: 75 }),
        createTestPlayer({ id: 'seller_p4', teamId: 'cpu_seller', position: Position.MIDFIELDER, defaultStat: 75 })
      ]);
      for (let i = 5; i <= 17; i++) {
        sellerTeam.players.push(createTestPlayer({ id: `seller_p${i}`, teamId: 'cpu_seller', position: Position.DEFENDER }));
      }
      sellerTeam.playerIds = sellerTeam.players.map(p => p.id);
      sellerTeam.seasonSnapshots![0].playerIds = sellerTeam.playerIds;

      const league = makeLeague([userTeam, buyerTeam, sellerTeam], 'user_team');
      league.currentWeek = 1;
      league.transferListings = ['seller_p1'];

      const { service, normalizedDbSpy } = setup({ league, rngRandomValue: 0.1 });
      await service.ensureHydrated();

      service.simulateCurrentWeek();

      const inMemoryListings = service.league()?.transferListings ?? [];
      expect(normalizedDbSpy.saveTransfer).toHaveBeenCalledTimes(1);
      expect(normalizedDbSpy.saveTransfer.mock.calls[0][4].transferListings).toEqual(inMemoryListings);
      expect(inMemoryListings).not.toContain('seller_p1');
    });

    it('should use fresh team state when a CPU club sells then buys in the same pass', async () => {
      const userTeam = makeTeam('user_team', []);
      const cpuBuyer = makeTeam('cpu_buyer', [
        createTestPlayer({ id: 'buyer_mid', teamId: 'cpu_buyer', position: Position.MIDFIELDER, defaultStat: 80 }),
        createTestPlayer({ id: 'buyer_def1', teamId: 'cpu_buyer', position: Position.DEFENDER, defaultStat: 70 }),
        createTestPlayer({ id: 'buyer_def2', teamId: 'cpu_buyer', position: Position.DEFENDER, defaultStat: 70 }),
        createTestPlayer({ id: 'buyer_def3', teamId: 'cpu_buyer', position: Position.DEFENDER, defaultStat: 70 }),
      ], 20000000);

      const hubMid = createTestPlayer({ id: 'hub_mid', teamId: 'cpu_hub', position: Position.MIDFIELDER, defaultStat: 75 });
      const hubTeam = makeTeam('cpu_hub', [
        hubMid,
        createTestPlayer({ id: 'hub_mid2', teamId: 'cpu_hub', position: Position.MIDFIELDER, defaultStat: 74 }),
        createTestPlayer({ id: 'hub_mid3', teamId: 'cpu_hub', position: Position.MIDFIELDER, defaultStat: 73 }),
        createTestPlayer({ id: 'hub_mid4', teamId: 'cpu_hub', position: Position.MIDFIELDER, defaultStat: 72 }),
        createTestPlayer({ id: 'hub_def1', teamId: 'cpu_hub', position: Position.DEFENDER, defaultStat: 70 }),
        createTestPlayer({ id: 'hub_def2', teamId: 'cpu_hub', position: Position.DEFENDER, defaultStat: 69 }),
        createTestPlayer({ id: 'hub_def3', teamId: 'cpu_hub', position: Position.DEFENDER, defaultStat: 68 }),
      ], 100000);
      for (let i = 8; i <= 17; i++) {
        hubTeam.players.push(createTestPlayer({ id: `hub_fill${i}`, teamId: 'cpu_hub', position: Position.FORWARD, defaultStat: 60 }));
      }
      hubTeam.playerIds = hubTeam.players.map(p => p.id);
      hubTeam.seasonSnapshots![0].playerIds = hubTeam.playerIds;

      const defForSale = createTestPlayer({ id: 'def_for_sale', teamId: 'cpu_def_seller', position: Position.DEFENDER, defaultStat: 72 });
      const defSeller = makeTeam('cpu_def_seller', [
        defForSale,
        createTestPlayer({ id: 'def2', teamId: 'cpu_def_seller', position: Position.DEFENDER, defaultStat: 70 }),
        createTestPlayer({ id: 'def3', teamId: 'cpu_def_seller', position: Position.DEFENDER, defaultStat: 70 }),
        createTestPlayer({ id: 'def4', teamId: 'cpu_def_seller', position: Position.DEFENDER, defaultStat: 70 }),
      ]);
      for (let i = 5; i <= 17; i++) {
        defSeller.players.push(createTestPlayer({ id: `def_fill${i}`, teamId: 'cpu_def_seller', position: Position.MIDFIELDER, defaultStat: 65 }));
      }
      defSeller.playerIds = defSeller.players.map(p => p.id);
      defSeller.seasonSnapshots![0].playerIds = defSeller.playerIds;

      const askingPrice = Math.round(calculateMarketValue(defForSale, 2026) * 1.15);
      expect(askingPrice).toBeGreaterThan(hubTeam.finances.transferBudget);

      const league = makeLeague([userTeam, cpuBuyer, hubTeam, defSeller], 'user_team');
      league.currentWeek = 1;
      league.transferListings = ['hub_mid', 'def_for_sale'];

      const { service, rngSpy } = setup({ league });
      await service.ensureHydrated();

      let rngCallCount = 0;
      rngSpy.random.mockImplementation(() => {
        rngCallCount++;
        if (rngCallCount <= 2) {
          return 0.5;
        }
        return 0.1;
      });

      service.simulateCurrentWeek();

      const offers = service.league()?.transferOffers ?? [];
      expect(offers.map(o => ({ buyerTeamId: o.buyerTeamId, sellerTeamId: o.sellerTeamId, playerId: o.playerId }))).toEqual([
        { buyerTeamId: 'cpu_buyer', sellerTeamId: 'cpu_hub', playerId: 'hub_mid' },
        { buyerTeamId: 'cpu_hub', sellerTeamId: 'cpu_def_seller', playerId: 'def_for_sale' },
      ]);
      expect(service.getPlayer('def_for_sale')?.teamId).toBe('cpu_hub');
    });

    it('should not allow newly transferred CPU players to be auto-listed again in the same season', async () => {
      const transferredPlayer = createTestPlayer({
        id: 'hot_potato',
        teamId: 'cpu_team_1',
        position: Position.MIDFIELDER,
        defaultStat: 80
      });
      transferredPlayer.transferHistory = [{
        sellerTeamId: 'cpu_team_2',
        buyerTeamId: 'cpu_team_1',
        fee: 1000000,
        seasonYear: 2026,
        week: 1
      }];

      const team = makeTeam('cpu_team_1', [
        transferredPlayer,
        createTestPlayer({ id: 'p2', teamId: 'cpu_team_1', position: Position.MIDFIELDER, defaultStat: 75 }),
        createTestPlayer({ id: 'p3', teamId: 'cpu_team_1', position: Position.MIDFIELDER, defaultStat: 75 }),
        createTestPlayer({ id: 'p4', teamId: 'cpu_team_1', position: Position.MIDFIELDER, defaultStat: 75 })
      ]);
      team.playerIds = team.players.map(p => p.id);
      team.seasonSnapshots![0].playerIds = team.playerIds;

      const userTeam = makeTeam('user_team', []);
      const league = makeLeague([userTeam, team], 'user_team');
      league.currentWeek = 1;

      const { service } = setup({ league });
      await service.ensureHydrated();

      const listings = service.runCpuAutoListingForLeague(service.league()!);
      expect(listings).not.toContain('hot_potato');
    });

    it('should clamp the peer overall interpolation factor t to [0, 1] in calculateAskingPrice', async () => {
      // Create a starter with overall 95, and peers with overalls 70 and 80.
      // The starter overall (95) is above maxOvr (80), rawT would be (95 - 70) / (80 - 70) = 2.5.
      // Clamping should force t to 1.0, yielding the max starter multiplier of 1.60x.
      const targetPlayer = createTestPlayer({ id: 'super_starter', teamId: 'seller_team', position: Position.MIDFIELDER, defaultStat: 95 });
      const peer1 = createTestPlayer({ id: 'peer1', teamId: 'seller_team', position: Position.MIDFIELDER, defaultStat: 80 });
      const peer2 = createTestPlayer({ id: 'peer2', teamId: 'seller_team', position: Position.MIDFIELDER, defaultStat: 70 });

      const buyerTeam = makeTeam('buyer_team', []);
      const sellerTeam = makeTeam('seller_team', [targetPlayer, peer1, peer2]);
      const league = makeLeague([buyerTeam, sellerTeam], 'buyer_team');

      const { service } = setup({ league });
      await service.ensureHydrated();

      const marketValue = calculateMarketValue(targetPlayer, 2026);
      const expectedAskingPrice = Math.round(marketValue * 1.60); // 1.40 + 1.0 * 0.20 = 1.60
      const askingPrice = service.calculateAskingPrice(targetPlayer, 2026);
      expect(askingPrice).toBe(expectedAskingPrice);
    });
  });
});
