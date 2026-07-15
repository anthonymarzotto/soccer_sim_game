import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TeamStatsComponent } from './team-stats';
import { signal } from '@angular/core';
import { GameService } from '../../services/game.service';
import { provideRouter } from '@angular/router';
import { League } from '../../models/types';

describe('TeamStatsComponent', () => {
  let component: TeamStatsComponent;
  let fixture: ComponentFixture<TeamStatsComponent>;
  let gameServiceStub: Partial<GameService>;

  beforeEach(async () => {
    gameServiceStub = {
      league: signal<League>({
        currentSeasonYear: 2024,
        teams: [],
        schedule: [],
        currentWeek: 1,
        transferListings: [],
        transferOffers: []
      }),
      getTeamSnapshotForSeason: vi.fn().mockReturnValue({ stats: {} })
    };

    await TestBed.configureTestingModule({
      imports: [TeamStatsComponent],
      providers: [
        { provide: GameService, useValue: gameServiceStub },
        provideRouter([])
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TeamStatsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
