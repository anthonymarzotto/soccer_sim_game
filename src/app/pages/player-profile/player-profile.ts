import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { SettingsService } from '../../services/settings.service';
import { Position } from '../../models/enums';
import { TeamBadgeComponent } from '../../components/team-badge/team-badge';

@Component({
  selector: 'app-player-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TeamBadgeComponent],
  templateUrl: './player-profile.html',
})
export class PlayerProfileComponent {
  private route = inject(ActivatedRoute);
  private gameService = inject(GameService);
  private settingsService = inject(SettingsService);

  // Expose enums for template
  Position = Position;
  badgeStyle = this.settingsService.badgeStyle;

  private playerId = computed(() => this.route.snapshot.paramMap.get('id'));

  player = computed(() => {
    const id = this.playerId();
    if (!id) return undefined;
    return this.gameService.getPlayer(id);
  });

  team = computed(() => {
    const p = this.player();
    if (!p) return undefined;
    return this.gameService.getTeam(p.teamId);
  });

  // Toggle states for each skill section
  mentalView = signal<'list' | 'chart'>('list');
  physicalView = signal<'list' | 'chart'>('list');
  technicalView = signal<'list' | 'chart'>('list');

  // Toggle methods
  toggleMentalView() {
    this.mentalView.update(v => v === 'list' ? 'chart' : 'list');
  }

  togglePhysicalView() {
    this.physicalView.update(v => v === 'list' ? 'chart' : 'list');
  }

  toggleTechnicalView() {
    this.technicalView.update(v => v === 'list' ? 'chart' : 'list');
  }

  // Chart data computation
  mentalChartData = computed(() => {
    const mental = this.player()?.mental;
    if (!mental) return [];
    
    return [
      { label: 'Flair', value: mental.flair },
      { label: 'Vision', value: mental.vision },
      { label: 'Determination', value: mental.determination }
    ];
  });

  physicalChartData = computed(() => {
    const physical = this.player()?.physical;
    if (!physical) return [];
    
    return [
      { label: 'Speed', value: physical.speed },
      { label: 'Strength', value: physical.strength },
      { label: 'Endurance', value: physical.endurance }
    ];
  });

  technicalChartData = computed(() => {
    const skills = this.player()?.skills;
    if (!skills) return [];
    
    return [
      { label: 'Tackling', value: skills.tackling },
      { label: 'Shooting', value: skills.shooting },
      { label: 'Heading', value: skills.heading },
      { label: 'Long Passing', value: skills.longPassing },
      { label: 'Short Passing', value: skills.shortPassing },
      { label: 'Goalkeeping', value: skills.goalkeeping }
    ];
  });

  // Chart calculation helpers
  createChartPoints(data: {label: string, value: number}[], size = 120): string {
    if (data.length === 0) return '';
    
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 10;
    const points: string[] = [];
    
    data.forEach((item, index) => {
      const angle = (index / data.length) * 2 * Math.PI - Math.PI / 2;
      const x = centerX + (radius * (item.value / 100)) * Math.cos(angle);
      const y = centerY + (radius * (item.value / 100)) * Math.sin(angle);
      points.push(`${x},${y}`);
    });
    
    return points.join(' ');
  }

  createAxisPoints(data: {label: string, value: number}[], size = 120): string {
    if (data.length === 0) return '';
    
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 10;
    const points: string[] = [];
    
    data.forEach((item, index) => {
      const angle = (index / data.length) * 2 * Math.PI - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      points.push(`${x},${y}`);
    });
    
    return points.join(' ');
  }

  getAxisLabelPosition(index: number, data: {label: string, value: number}[], size = 120): { x: number, y: number } {
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 + 15; // Position labels outside the chart
    const angle = (index / data.length) * 2 * Math.PI - Math.PI / 2;
    
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    };
  }
}
