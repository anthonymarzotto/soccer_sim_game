import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgClass, NgStyle } from '@angular/common';
import { RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { SettingsService } from '../../services/settings.service';

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

  private getNameHash(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }

  badgeColor = computed(() => {
    const name = this.teamName();
    if (!name) return 'bg-zinc-700';
    
    // Generate a consistent color based on team name hash
    const hash = this.getNameHash(name);
    
    // Use a set of distinct colors that work well on dark backgrounds
    const colors = [
      'bg-red-600',
      'bg-blue-600',
      'bg-emerald-600',
      'bg-amber-600',
      'bg-purple-600',
      'bg-pink-600',
      'bg-cyan-600',
      'bg-orange-600',
      'bg-teal-600',
      'bg-indigo-600',
      'bg-rose-600',
      'bg-lime-600',
      'bg-sky-600',
      'bg-violet-600',
      'bg-fuchsia-600',
      'bg-green-600',
      'bg-yellow-600',
      'bg-slate-600',
      'bg-zinc-600',
      'bg-stone-600'
    ];
    
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  });

  textColor = computed(() => {
    const name = this.teamName();
    if (!name) return 'text-zinc-400';
    
    const hash = this.getNameHash(name);
    
    const textColors = [
      'text-red-400',
      'text-blue-400',
      'text-emerald-400',
      'text-amber-400',
      'text-purple-400',
      'text-pink-400',
      'text-cyan-400',
      'text-orange-400',
      'text-teal-400',
      'text-indigo-400',
      'text-rose-400',
      'text-lime-400',
      'text-sky-400',
      'text-violet-400',
      'text-fuchsia-400',
      'text-green-400',
      'text-yellow-400',
      'text-slate-400',
      'text-zinc-400',
      'text-stone-400'
    ];
    
    const index = Math.abs(hash) % textColors.length;
    return textColors[index];
  });

  borderColor = computed(() => {
    const name = this.teamName();
    if (!name) return 'border-zinc-500';
    
    const hash = this.getNameHash(name);
    
    const borderColors = [
      'border-red-500',
      'border-blue-500',
      'border-emerald-500',
      'border-amber-500',
      'border-purple-500',
      'border-pink-500',
      'border-cyan-500',
      'border-orange-500',
      'border-teal-500',
      'border-indigo-500',
      'border-rose-500',
      'border-lime-500',
      'border-sky-500',
      'border-violet-500',
      'border-fuchsia-500',
      'border-green-500',
      'border-yellow-500',
      'border-slate-500',
      'border-zinc-500',
      'border-stone-500'
    ];
    
    const index = Math.abs(hash) % borderColors.length;
    return borderColors[index];
  });

  sizeClasses = computed(() => {
    return this.size() === 'sm' 
      ? 'px-1.5 py-0.5 text-xs min-w-[2rem]'
      : 'px-2 py-1 text-sm min-w-[2.5rem]';
  });

  gradientStyle = computed(() => {
    const name = this.teamName();
    if (!name) return {};
    
    const hash = this.getNameHash(name);
    
    const gradients = [
      { from: '#ef4444', to: '#7f1d1d' }, // red - more pronounced
      { from: '#3b82f6', to: '#1e3a8a' }, // blue - more pronounced
      { from: '#10b981', to: '#064e3b' }, // emerald - more pronounced
      { from: '#f59e0b', to: '#78350f' }, // amber - more pronounced
      { from: '#a855f7', to: '#581c87' }, // purple - more pronounced
      { from: '#f472b6', to: '#831843' }, // pink - more pronounced
      { from: '#06b6d4', to: '#164e63' }, // cyan - more pronounced
      { from: '#f97316', to: '#7c2d12' }, // orange - more pronounced
      { from: '#2dd4bf', to: '#134e4a' }, // teal - more pronounced
      { from: '#6366f1', to: '#312e81' }, // indigo - more pronounced
      { from: '#fb7185', to: '#881337' }, // rose - more pronounced
      { from: '#a3e635', to: '#365314' }, // lime - more pronounced
      { from: '#38bdf8', to: '#0c4a6e' }, // sky - more pronounced
      { from: '#8b5cf6', to: '#4c1d95' }, // violet - more pronounced
      { from: '#e879f9', to: '#701a75' }, // fuchsia - more pronounced
      { from: '#4ade80', to: '#14532d' }, // green - more pronounced
      { from: '#facc15', to: '#713f12' }, // yellow - more pronounced
      { from: '#94a3b8', to: '#1e293b' }, // slate - more pronounced
      { from: '#a1a1aa', to: '#18181b' }, // zinc - more pronounced
      { from: '#a8a29e', to: '#292524' }  // stone - more pronounced
    ];
    
    const index = Math.abs(hash) % gradients.length;
    const { from, to } = gradients[index];
    
    return {
      'background': `linear-gradient(135deg, ${from}, ${to})`
    };
  });
}
