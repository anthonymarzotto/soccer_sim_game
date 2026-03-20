import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgClass, NgStyle } from '@angular/common';
import { GameService } from '../../services/game.service';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-team-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, NgStyle],
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
    
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash;
    }
    
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
    
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash;
    }
    
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
    
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash;
    }
    
    const gradients = [
      { from: '#dc2626', to: '#991b1b' }, // red
      { from: '#2563eb', to: '#1e40af' }, // blue
      { from: '#059669', to: '#047857' }, // emerald
      { from: '#d97706', to: '#b45309' }, // amber
      { from: '#9333ea', to: '#7c3aed' }, // purple
      { from: '#ec4899', to: '#db2777' }, // pink
      { from: '#0891b2', to: '#0e7490' }, // cyan
      { from: '#ea580c', to: '#c2410c' }, // orange
      { from: '#14b8a6', to: '#0d9488' }, // teal
      { from: '#4f46e5', to: '#4338ca' }, // indigo
      { from: '#f43f5e', to: '#e11d48' }, // rose
      { from: '#84cc16', to: '#65a30d' }, // lime
      { from: '#0ea5e9', to: '#0284c7' }, // sky
      { from: '#7c3aed', to: '#6d28d9' }, // violet
      { from: '#d946ef', to: '#c026d3' }, // fuchsia
      { from: '#22c55e', to: '#16a34a' }, // green
      { from: '#eab308', to: '#ca8a04' }, // yellow
      { from: '#64748b', to: '#475569' }, // slate
      { from: '#71717a', to: '#52525b' }, // zinc
      { from: '#78716c', to: '#57534e' }  // stone
    ];
    
    const index = Math.abs(hash) % gradients.length;
    const { from, to } = gradients[index];
    
    return {
      'background': `linear-gradient(to right, ${from}, ${to})`
    };
  });
}
