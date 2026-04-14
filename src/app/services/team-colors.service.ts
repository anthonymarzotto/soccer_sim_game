import { Injectable } from '@angular/core';

export interface TeamColorPalette {
  badgeClass: string;
  textClass: string;
  borderClass: string;
  solidHex: string;
  gradient: {
    from: string;
    to: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class TeamColorsService {
  private readonly palettes: TeamColorPalette[] = [
    { badgeClass: 'bg-red-600', textClass: 'text-red-400', borderClass: 'border-red-500', solidHex: '#dc2626', gradient: { from: '#ef4444', to: '#7f1d1d' } },
    { badgeClass: 'bg-blue-600', textClass: 'text-blue-400', borderClass: 'border-blue-500', solidHex: '#2563eb', gradient: { from: '#3b82f6', to: '#1e3a8a' } },
    { badgeClass: 'bg-emerald-600', textClass: 'text-emerald-400', borderClass: 'border-emerald-500', solidHex: '#059669', gradient: { from: '#10b981', to: '#064e3b' } },
    { badgeClass: 'bg-amber-600', textClass: 'text-amber-400', borderClass: 'border-amber-500', solidHex: '#d97706', gradient: { from: '#f59e0b', to: '#78350f' } },
    { badgeClass: 'bg-purple-600', textClass: 'text-purple-400', borderClass: 'border-purple-500', solidHex: '#9333ea', gradient: { from: '#a855f7', to: '#581c87' } },
    { badgeClass: 'bg-pink-600', textClass: 'text-pink-400', borderClass: 'border-pink-500', solidHex: '#db2777', gradient: { from: '#f472b6', to: '#831843' } },
    { badgeClass: 'bg-cyan-600', textClass: 'text-cyan-400', borderClass: 'border-cyan-500', solidHex: '#0891b2', gradient: { from: '#06b6d4', to: '#164e63' } },
    { badgeClass: 'bg-orange-600', textClass: 'text-orange-400', borderClass: 'border-orange-500', solidHex: '#ea580c', gradient: { from: '#f97316', to: '#7c2d12' } },
    { badgeClass: 'bg-teal-600', textClass: 'text-teal-400', borderClass: 'border-teal-500', solidHex: '#0d9488', gradient: { from: '#2dd4bf', to: '#134e4a' } },
    { badgeClass: 'bg-indigo-600', textClass: 'text-indigo-400', borderClass: 'border-indigo-500', solidHex: '#4f46e5', gradient: { from: '#6366f1', to: '#312e81' } },
    { badgeClass: 'bg-rose-600', textClass: 'text-rose-400', borderClass: 'border-rose-500', solidHex: '#e11d48', gradient: { from: '#fb7185', to: '#881337' } },
    { badgeClass: 'bg-lime-600', textClass: 'text-lime-400', borderClass: 'border-lime-500', solidHex: '#65a30d', gradient: { from: '#a3e635', to: '#365314' } },
    { badgeClass: 'bg-sky-600', textClass: 'text-sky-400', borderClass: 'border-sky-500', solidHex: '#0284c7', gradient: { from: '#38bdf8', to: '#0c4a6e' } },
    { badgeClass: 'bg-violet-600', textClass: 'text-violet-400', borderClass: 'border-violet-500', solidHex: '#7c3aed', gradient: { from: '#8b5cf6', to: '#4c1d95' } },
    { badgeClass: 'bg-fuchsia-600', textClass: 'text-fuchsia-400', borderClass: 'border-fuchsia-500', solidHex: '#c026d3', gradient: { from: '#e879f9', to: '#701a75' } },
    { badgeClass: 'bg-green-600', textClass: 'text-green-400', borderClass: 'border-green-500', solidHex: '#16a34a', gradient: { from: '#4ade80', to: '#14532d' } },
    { badgeClass: 'bg-yellow-600', textClass: 'text-yellow-400', borderClass: 'border-yellow-500', solidHex: '#ca8a04', gradient: { from: '#facc15', to: '#713f12' } },
    { badgeClass: 'bg-slate-600', textClass: 'text-slate-400', borderClass: 'border-slate-500', solidHex: '#475569', gradient: { from: '#94a3b8', to: '#1e293b' } },
    { badgeClass: 'bg-zinc-600', textClass: 'text-zinc-400', borderClass: 'border-zinc-500', solidHex: '#52525b', gradient: { from: '#a1a1aa', to: '#18181b' } },
    { badgeClass: 'bg-stone-600', textClass: 'text-stone-400', borderClass: 'border-stone-500', solidHex: '#57534e', gradient: { from: '#a8a29e', to: '#292524' } },
  ];

  getPalette(teamName: string | null | undefined): TeamColorPalette {
    if (!teamName) {
      return {
        badgeClass: 'bg-zinc-700',
        textClass: 'text-zinc-400',
        borderClass: 'border-zinc-500',
        solidHex: '#3f3f46',
        gradient: { from: '#52525b', to: '#18181b' }
      };
    }

    const index = Math.abs(this.getNameHash(teamName)) % this.palettes.length;
    return this.palettes[index];
  }

  private getNameHash(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return hash;
  }
}