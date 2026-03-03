#!/usr/bin/env tsx
/**
 * Create API Key Script
 *
 * Creates a new API key for an agent and stores it in AWS Secrets Manager.
 *
 * Usage:
 *   npm run apikey:create -- --agent agent-001 --label "Production Key"
 */

import { createAgentApiKey } from '../lib/aws-secrets';

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const getArg = (name: string): string | undefined => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };

  const agentId = getArg('agent');
  const label = getArg('label') || 'Default API Key';

  // Validate required arguments
  if (!agentId) {
    console.error('Error: Missing required arguments');
    console.log('');
    console.log('Usage:');
    console.log('  npm run apikey:create -- \\');
    console.log('    --agent <agent-id> \\');
    console.log('    [--label <label>]');
    console.log('');
    console.log('Example:');
    console.log('  npm run apikey:create -- \\');
    console.log('    --agent agent-001 \\');
    console.log('    --label "Production Key"');
    process.exit(1);
  }

  console.log(`Creating API key for agent: ${agentId}`);
  console.log(`Label: ${label}`);
  console.log('');

  try {
    // Create the API key
    console.log('1. Generating API key...');
    const { rawKey, hashedKey } = await createAgentApiKey(agentId, label);

    console.log('   ✅ API key generated');
    console.log('');
    console.log('2. Storing in AWS Secrets Manager...');
    console.log('   ✅ Stored successfully');
    console.log('');
    console.log('━'.repeat(70));
    console.log('🔑 API KEY CREATED SUCCESSFULLY');
    console.log('━'.repeat(70));
    console.log('');
    console.log('⚠️  IMPORTANT: Save this API key now! You will not be able to see it again.');
    console.log('');
    console.log(`API Key: ${rawKey}`);
    console.log('');
    console.log('━'.repeat(70));
    console.log('');
    console.log('Usage:');
    console.log('  Include this key in the x-api-key header when making requests:');
    console.log('');
    console.log('  curl https://your-domain.com/api/proxy/anthropic/v1/messages \\');
    console.log(`    -H "x-api-key: ${rawKey}" \\`);
    console.log('    -H "Content-Type: application/json" \\');
    console.log('    -d \'{"model": "claude-3-haiku-20240307", ...}\'');
    console.log('');
    console.log(`Hashed Key (for reference): ${hashedKey.substring(0, 16)}...`);
    console.log('');
  } catch (error) {
    console.error('');
    console.error('❌ Error creating API key:', error);
    console.error('');
    console.error('Common issues:');
    console.error('  - AWS credentials not configured');
    console.error('  - No permissions to access AWS Secrets Manager');
    console.error('  - Agent does not exist in config/agents.json');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
