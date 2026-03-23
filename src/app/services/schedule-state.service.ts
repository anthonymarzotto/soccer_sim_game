import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ScheduleStateService {
  selectedWeek = signal<number>(1);
}