import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

interface DesignDoc {
  label: string;
  path: string;
  description: string;
}

const DESIGN_DOCS: DesignDoc[] = [
  {
    label: 'Simulation Flow',
    path: '/design-docs/simulation-flow.html',
    description: 'Variant B simulation loop — high-level flowchart'
  },
  {
    label: 'PlayerSeasonAttributes Usage',
    path: '/design-docs/player-season-attributes-usage.html',
    description: 'Where each seasonal stat enters Variant B and match setup'
  }
];

@Component({
  selector: 'app-design-docs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './design-docs.html'
})
export class DesignDocsComponent {
  private sanitizer = inject(DomSanitizer);

  readonly docs = DESIGN_DOCS;
  readonly selectedDoc = signal<DesignDoc>(DESIGN_DOCS[0]);

  readonly iframeSrc = computed<SafeResourceUrl>(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(this.selectedDoc().path)
  );

  selectDoc(doc: DesignDoc): void {
    this.selectedDoc.set(doc);
  }
}
