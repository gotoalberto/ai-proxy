#!/usr/bin/env tsx
/**
 * Create Service Script
 *
 * Creates a new service by storing its credentials in AWS Secrets Manager
 * and updating the services configuration file.
 *
 * Usage:
 *   npm run service:create -- --slug anthropic --name "Anthropic Claude" \
 *     --base-url "https://api.anthropic.com" --auth-type header \
 *     --auth-header x-api-key --api-key "sk-ant-xxx"
 */

import { createServiceSecret } from '../lib/aws-secrets';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { ServicesConfiguration, ServiceConfig } from '../types';

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const getArg = (name: string): string | undefined => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };

  const slug = getArg('slug');
  const name = getArg('name');
  const baseUrl = getArg('base-url');
  const authType = getArg('auth-type') as 'header' | 'query' | 'aws-sigv4' | 'bearer' | 'none';
  const authHeader = getArg('auth-header');
  const authQueryParam = getArg('auth-query-param');
  const apiKey = getArg('api-key');
  const accessKeyId = getArg('access-key-id');
  const secretAccessKey = getArg('secret-access-key');
  const region = getArg('region') || 'us-east-1';
  const description = getArg('description');

  // Validate required arguments
  if (!slug || !name || !baseUrl || !authType) {
    console.error('Error: Missing required arguments');
    console.log('');
    console.log('Usage:');
    console.log('  npm run service:create -- \\');
    console.log('    --slug <slug> \\');
    console.log('    --name <name> \\');
    console.log('    --base-url <url> \\');
    console.log('    --auth-type <header|query|aws-sigv4|bearer|none> \\');
    console.log('    [--auth-header <header-name>] \\');
    console.log('    [--auth-query-param <param-name>] \\');
    console.log('    [--api-key <key>] \\');
    console.log('    [--access-key-id <aws-key>] \\');
    console.log('    [--secret-access-key <aws-secret>] \\');
    console.log('    [--region <aws-region>] \\');
    console.log('    [--description <description>]');
    process.exit(1);
  }

  console.log(`Creating service: ${name} (${slug})`);
  console.log('');

  // Build credentials object
  const credentials: any = {};

  if (apiKey) {
    credentials.apiKey = apiKey;
  }

  if (accessKeyId && secretAccessKey) {
    credentials.accessKeyId = accessKeyId;
    credentials.secretAccessKey = secretAccessKey;
    credentials.region = region;
  }

  if (Object.keys(credentials).length === 0) {
    console.error('Error: No credentials provided (need --api-key or --access-key-id + --secret-access-key)');
    process.exit(1);
  }

  // Create secret in AWS Secrets Manager
  console.log('1. Creating secret in AWS Secrets Manager...');
  await createServiceSecret(slug, credentials);
  console.log('   ✅ Secret created');

  // Update services.json
  console.log('2. Updating services.json...');
  const configPath = join(process.cwd(), 'config', 'services.json');

  let config: ServicesConfiguration;
  try {
    const content = await readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    config = { services: [] };
  }

  // Check if service already exists
  const existingIndex = config.services.findIndex(s => s.slug === slug);

  const newService: ServiceConfig = {
    slug,
    name,
    targetBaseUrl: baseUrl,
    authType,
    authHeader,
    authQueryParam,
    secretName: `ai-proxy/services/${slug}`,
    description,
  };

  if (existingIndex >= 0) {
    config.services[existingIndex] = newService;
    console.log('   ✅ Service updated in configuration');
  } else {
    config.services.push(newService);
    console.log('   ✅ Service added to configuration');
  }

  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');

  console.log('');
  console.log('✅ Service created successfully!');
  console.log('');
  console.log('Service details:');
  console.log(`  Slug: ${slug}`);
  console.log(`  Name: ${name}`);
  console.log(`  Base URL: ${baseUrl}`);
  console.log(`  Auth Type: ${authType}`);
  if (authHeader) console.log(`  Auth Header: ${authHeader}`);
  if (authQueryParam) console.log(`  Auth Query Param: ${authQueryParam}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Assign this service to an agent in config/agents.json');
  console.log('  2. Test the service through the proxy');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
