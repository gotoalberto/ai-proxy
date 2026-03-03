#!/usr/bin/env tsx
/**
 * Create Agent Script
 *
 * Creates a new agent by adding it to the agents configuration file.
 *
 * Usage:
 *   npm run agent:create -- --id agent-001 --name my-agent \
 *     --services anthropic,aws-s3,elevenlabs \
 *     --description "Main agent for AI tasks"
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { AgentsConfiguration, AgentConfig } from '../types';

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const getArg = (name: string): string | undefined => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };

  const id = getArg('id');
  const name = getArg('name');
  const servicesArg = getArg('services');
  const description = getArg('description');

  // Validate required arguments
  if (!id || !name || !servicesArg) {
    console.error('Error: Missing required arguments');
    console.log('');
    console.log('Usage:');
    console.log('  npm run agent:create -- \\');
    console.log('    --id <agent-id> \\');
    console.log('    --name <agent-name> \\');
    console.log('    --services <service1,service2,...> \\');
    console.log('    [--description <description>]');
    console.log('');
    console.log('Example:');
    console.log('  npm run agent:create -- \\');
    console.log('    --id agent-001 \\');
    console.log('    --name my-agent \\');
    console.log('    --services anthropic,aws-s3,elevenlabs \\');
    console.log('    --description "Main agent for AI tasks"');
    process.exit(1);
  }

  // Parse services list
  const services = servicesArg.split(',').map(s => s.trim()).filter(s => s);

  console.log(`Creating agent: ${name} (${id})`);
  console.log('');

  // Update agents.json
  console.log('1. Updating agents.json...');
  const configPath = join(process.cwd(), 'config', 'agents.json');

  let config: AgentsConfiguration;
  try {
    const content = await readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    config = { agents: [] };
  }

  // Check if agent already exists
  const existingIndex = config.agents.findIndex(a => a.id === id);

  const newAgent: AgentConfig = {
    id,
    name,
    services,
    apiKeySecretName: `ai-proxy/agents/${id}/api-keys`,
    description,
  };

  if (existingIndex >= 0) {
    config.agents[existingIndex] = newAgent;
    console.log('   ✅ Agent updated in configuration');
  } else {
    config.agents.push(newAgent);
    console.log('   ✅ Agent added to configuration');
  }

  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');

  console.log('');
  console.log('✅ Agent created successfully!');
  console.log('');
  console.log('Agent details:');
  console.log(`  ID: ${id}`);
  console.log(`  Name: ${name}`);
  console.log(`  Services: ${services.join(', ')}`);
  console.log(`  API Keys Secret: ai-proxy/agents/${id}/api-keys`);
  if (description) console.log(`  Description: ${description}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Create an API key for this agent:');
  console.log(`     npm run apikey:create -- --agent ${id} --label "Production Key"`);
  console.log('  2. The agent will have access to these services:');
  services.forEach(service => {
    console.log(`     - ${service}`);
  });
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
