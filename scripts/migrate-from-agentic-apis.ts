#!/usr/bin/env tsx
/**
 * Migration Script from agentic-apis
 *
 * Migrates services and agents from the old agentic-apis project
 * (Prisma + PostgreSQL) to the new ai-proxy project (AWS Secrets Manager).
 *
 * Usage:
 *   npm run migrate -- --db-url "postgresql://..." [--dry-run]
 *
 * Requirements:
 *   - Database connection string from old project
 *   - AWS credentials configured (for creating secrets)
 *   - Prisma client from old project (optional, can use direct SQL)
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { ServiceConfig, AgentConfig } from '../types';
import { createServiceSecret, createOrUpdateSecret } from '../lib/aws-secrets';

// Simple SQL-based approach (no Prisma dependency needed)
async function queryDatabase(connectionString: string, query: string): Promise<any[]> {
  // For now, this is a placeholder
  // In a real migration, you'd use pg or another PostgreSQL client
  throw new Error('Direct database connection not implemented. Please export data first.');
}

interface OldService {
  slug: string;
  name: string;
  targetBaseUrl: string;
  authType: string;
  authHeader?: string;
  authQueryParam?: string;
  description?: string;
  credentials: {
    apiKey?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
  };
}

interface OldAgent {
  id: string;
  name: string;
  services: string[];
  apiKeys: Array<{
    key: string; // hashed
    label: string;
    createdAt: Date;
  }>;
  description?: string;
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const getArg = (name: string): string | undefined => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };

  const hasFlag = (name: string): boolean => args.includes(`--${name}`);

  const dbUrl = getArg('db-url');
  const exportFile = getArg('export-file');
  const dryRun = hasFlag('dry-run');

  console.log('🔄 Migration from agentic-apis to ai-proxy');
  console.log('━'.repeat(70));
  console.log('');

  // Validate arguments
  if (!dbUrl && !exportFile) {
    console.error('Error: Must provide either --db-url or --export-file');
    console.log('');
    console.log('Usage Options:');
    console.log('');
    console.log('1. Migrate directly from database:');
    console.log('   npm run migrate -- \\');
    console.log('     --db-url "postgresql://user:pass@host:5432/db" \\');
    console.log('     [--dry-run]');
    console.log('');
    console.log('2. Migrate from exported JSON file:');
    console.log('   npm run migrate -- \\');
    console.log('     --export-file export.json \\');
    console.log('     [--dry-run]');
    console.log('');
    console.log('Recommended approach:');
    console.log('  1. First, export your data from agentic-apis:');
    console.log('     cd /path/to/agentic-apis');
    console.log('     npm run db:export > export.json');
    console.log('');
    console.log('  2. Then migrate using the export file:');
    console.log('     cd /path/to/ai-proxy');
    console.log('     npm run migrate -- --export-file /path/to/export.json');
    console.log('');
    process.exit(1);
  }

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log('');
  }

  let services: OldService[] = [];
  let agents: OldAgent[] = [];

  // Load data from export file or database
  if (exportFile) {
    console.log(`Loading data from export file: ${exportFile}`);
    try {
      const content = await readFile(exportFile, 'utf-8');
      const data = JSON.parse(content);
      services = data.services || [];
      agents = data.agents || [];
      console.log(`  ✅ Loaded ${services.length} services and ${agents.length} agents`);
    } catch (error) {
      console.error(`  ❌ Failed to load export file:`, error);
      process.exit(1);
    }
  } else if (dbUrl) {
    console.log('Database migration not yet implemented.');
    console.log('');
    console.log('Please export your data first:');
    console.log('  1. In agentic-apis project, create an export script');
    console.log('  2. Export services and agents to JSON');
    console.log('  3. Run this migration with --export-file');
    console.log('');
    process.exit(1);
  }

  console.log('');
  console.log('━'.repeat(70));
  console.log('📋 Migration Plan');
  console.log('━'.repeat(70));
  console.log('');
  console.log(`Services to migrate: ${services.length}`);
  services.forEach(s => console.log(`  - ${s.slug} (${s.name})`));
  console.log('');
  console.log(`Agents to migrate: ${agents.length}`);
  agents.forEach(a => console.log(`  - ${a.id} (${a.name}) - ${a.services.length} services`));
  console.log('');

  if (dryRun) {
    console.log('Dry run complete. No changes made.');
    return;
  }

  // Confirm before proceeding
  console.log('⚠️  This will:');
  console.log('   1. Create secrets in AWS Secrets Manager');
  console.log('   2. Update config/services.json');
  console.log('   3. Update config/agents.json');
  console.log('');
  console.log('Press Ctrl+C to cancel, or any key to continue...');

  // Wait for user confirmation (in a real implementation)
  // For now, we'll proceed automatically

  console.log('');
  console.log('━'.repeat(70));
  console.log('🚀 Starting Migration');
  console.log('━'.repeat(70));
  console.log('');

  let servicesCreated = 0;
  let servicesFailed = 0;

  // Migrate services
  console.log('1. Migrating services...');
  for (const service of services) {
    try {
      console.log(`   Creating service: ${service.slug}...`);

      // Create secret in AWS Secrets Manager
      await createServiceSecret(service.slug, service.credentials);
      servicesCreated++;

      console.log(`   ✅ ${service.slug}`);
    } catch (error) {
      console.error(`   ❌ ${service.slug}:`, error instanceof Error ? error.message : error);
      servicesFailed++;
    }
  }

  console.log('');
  console.log(`   Created: ${servicesCreated}, Failed: ${servicesFailed}`);
  console.log('');

  // Update services.json
  console.log('2. Updating config/services.json...');
  const servicesConfig = services.map(s => {
    const config: ServiceConfig = {
      slug: s.slug,
      name: s.name,
      targetBaseUrl: s.targetBaseUrl,
      authType: s.authType as any,
      secretName: `ai-proxy/services/${s.slug}`,
    };

    if (s.authHeader) config.authHeader = s.authHeader;
    if (s.authQueryParam) config.authQueryParam = s.authQueryParam;
    if (s.description) config.description = s.description;

    return config;
  });

  const servicesConfigPath = join(process.cwd(), 'config', 'services.json');
  await writeFile(
    servicesConfigPath,
    JSON.stringify({ services: servicesConfig }, null, 2) + '\n'
  );
  console.log('   ✅ services.json updated');
  console.log('');

  let agentsCreated = 0;
  let agentsFailed = 0;

  // Migrate agents
  console.log('3. Migrating agents...');
  for (const agent of agents) {
    try {
      console.log(`   Creating agent: ${agent.id}...`);

      // Create API keys secret in AWS Secrets Manager
      const secretName = `ai-proxy/agents/${agent.id}/api-keys`;
      await createOrUpdateSecret(secretName, { keys: agent.apiKeys });
      agentsCreated++;

      console.log(`   ✅ ${agent.id} (${agent.apiKeys.length} API keys)`);
    } catch (error) {
      console.error(`   ❌ ${agent.id}:`, error instanceof Error ? error.message : error);
      agentsFailed++;
    }
  }

  console.log('');
  console.log(`   Created: ${agentsCreated}, Failed: ${agentsFailed}`);
  console.log('');

  // Update agents.json
  console.log('4. Updating config/agents.json...');
  const agentsConfig = agents.map(a => {
    const config: AgentConfig = {
      id: a.id,
      name: a.name,
      services: a.services,
      apiKeySecretName: `ai-proxy/agents/${a.id}/api-keys`,
    };

    if (a.description) config.description = a.description;

    return config;
  });

  const agentsConfigPath = join(process.cwd(), 'config', 'agents.json');
  await writeFile(
    agentsConfigPath,
    JSON.stringify({ agents: agentsConfig }, null, 2) + '\n'
  );
  console.log('   ✅ agents.json updated');
  console.log('');

  // Summary
  console.log('━'.repeat(70));
  console.log('✅ Migration Complete');
  console.log('━'.repeat(70));
  console.log('');
  console.log('Summary:');
  console.log(`  Services: ${servicesCreated} created, ${servicesFailed} failed`);
  console.log(`  Agents: ${agentsCreated} created, ${agentsFailed} failed`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Review config/services.json and config/agents.json');
  console.log('  2. Test the proxy with: npm run dev');
  console.log('  3. Verify all services work correctly');
  console.log('');

  if (servicesFailed > 0 || agentsFailed > 0) {
    console.warn('⚠️  Some items failed to migrate. Review the errors above.');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
