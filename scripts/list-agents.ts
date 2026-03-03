#!/usr/bin/env tsx
/**
 * List Agents Script
 *
 * Lists all configured agents from config/agents.json
 *
 * Usage:
 *   npm run agent:list
 */

import { listAgents } from '../lib/config-loader';

async function main() {
  console.log('👥 Configured Agents');
  console.log('━'.repeat(70));
  console.log('');

  try {
    const agents = await listAgents();

    if (agents.length === 0) {
      console.log('No agents configured yet.');
      console.log('');
      console.log('Create your first agent:');
      console.log('  npm run agent:create -- --id agent-001 --name my-agent ...');
      return;
    }

    console.log(`Total: ${agents.length} agent(s)`);
    console.log('');

    agents.forEach(agent => {
      console.log(`  ${agent.id}`);
      console.log(`    Name: ${agent.name}`);
      console.log(`    Services (${agent.services.length}):`);
      agent.services.forEach(service => {
        console.log(`      - ${service}`);
      });
      console.log(`    API Keys Secret: ${agent.apiKeySecretName}`);
      if (agent.description) {
        console.log(`    Description: ${agent.description}`);
      }
      console.log('');
    });

    console.log('━'.repeat(70));
    console.log('');
    console.log('Agent management:');
    console.log('  Create agent:    npm run agent:create -- --id <id> ...');
    console.log('  Create API key:  npm run apikey:create -- --agent <id> ...');
    console.log('  Edit agent:      Edit config/agents.json directly');
    console.log('');

  } catch (error) {
    console.error('Error loading agents:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
