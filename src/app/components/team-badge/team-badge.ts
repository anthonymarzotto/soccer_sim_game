import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgClass, NgStyle } from '@angular/common';
import { RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { SettingsService } from '../../services/settings.service';
import { TeamColorsService } from '../../services/team-colors.service';

@Component({
  selector: 'app-team-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, NgStyle, RouterLink],
  templateUrl: './team-badge.html',
  styles: [`
    :host {
      display: inline-flex;
    }
  `]
})
export class TeamBadgeComponent {
  private gameService = inject(GameService);
  private settingsService = inject(SettingsService);
  private teamColorsService = inject(TeamColorsService);

  teamId = input.required<string>();
  size = input<'sm' | 'md'>('sm');
  link = input<boolean>(false);

  style = this.settingsService.badgeStyle;

  team = computed(() => {
    return this.gameService.getTeam(this.teamId());
  });

  teamName = computed(() => {
    return this.team()?.name || 'Unknown';
  });

  initials = computed(() => {
    const name = this.teamName();
    if (!name) return '?';
    
    const words = name.split(' ');
    if (words.length === 1) {
      return name.substring(0, 3).toUpperCase();
    }
    
    // For multi-word names, take first letter of each word (up to 3)
    return words
      .slice(0, 3)
      .map(word => word[0])
      .join('')
      .toUpperCase();
  });

  abbreviation = computed(() => {
    const name = this.teamName();
    if (!name) return '?';
    
    const words = name.split(' ');
    if (words.length === 1) {
      return name.substring(0, 2).toUpperCase();
    }
    
    // Take first letter of first two words
    return words
      .slice(0, 2)
      .map(word => word[0])
      .join('')
      .toUpperCase();
  });

  badgeColor = computed(() => {
    const name = this.teamName();
    return this.teamColorsService.getPalette(name).badgeClass;
  });

  textColor = computed(() => {
    const name = this.teamName();
    return this.teamColorsService.getPalette(name).textClass;
  });

  borderColor = computed(() => {
    const name = this.teamName();
    return this.teamColorsService.getPalette(name).borderClass;
  });

  sizeClasses = computed(() => {
    return this.size() === 'sm' 
      ? 'px-1.5 py-0.5 text-xs min-w-[2rem]'
      : 'px-2 py-1 text-sm min-w-[2.5rem]';
  });

  gradientStyle = computed(() => {
    const name = this.teamName();
    const { from, to } = this.teamColorsService.getPalette(name).gradient;
    
    return {
      'background': `linear-gradient(135deg, ${from}, ${to})`
    };
  });
}
