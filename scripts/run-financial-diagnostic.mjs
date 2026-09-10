import { execSync } from 'child_process';

process.env.RUN_FINANCIAL_DIAGNOSTIC = 'true';

try {
  execSync('npx ng test --watch=false --include src/app/services/financial-simulation-diagnostic.spec.ts', {
    stdio: 'inherit',
    env: process.env
  });
} catch (error) {
  process.exit(error.status || 1);
}
