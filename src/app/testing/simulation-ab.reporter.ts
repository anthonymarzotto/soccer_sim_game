import { SimulationABReport } from './simulation-ab.runner';

export class SimulationABReporter {
  static readonly DEFAULT_OUTPUT_DIR = 'test-output/simulation-ab';

  toJson(report: SimulationABReport): string {
    return JSON.stringify(report, null, 2);
  }

  async writeJsonReport(
    report: SimulationABReport,
    outputDir: string = SimulationABReporter.DEFAULT_OUTPUT_DIR
  ): Promise<string> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const uniqueName = this.createUniqueFileName();
    const absoluteOutputDir = path.resolve(process.cwd(), outputDir);
    const absolutePath = path.join(absoluteOutputDir, uniqueName);

    await fs.mkdir(absoluteOutputDir, { recursive: true });
    await fs.writeFile(absolutePath, this.toJson(report), 'utf-8');

    return absolutePath;
  }

  private createUniqueFileName(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    return `simulation-ab-${timestamp}-${randomSuffix}.json`;
  }
}
