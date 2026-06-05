import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-changelog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './changelog.html',
})
export class ChangelogComponent { }
