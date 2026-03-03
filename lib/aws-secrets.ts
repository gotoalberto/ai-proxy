/**
 * AWS Secrets Manager Integration
 *
 * This module provides functions to read and write secrets to AWS Secrets Manager.
 * Includes in-memory caching to reduce API calls and improve performance.
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
  CreateSecretCommand,
  UpdateSecretCommand,
  PutSecretValueCommand,
  ListSecretsCommand,
  DescribeSecretCommand,
} from '@aws-sdk/client-secrets-manager';

// Initialize AWS Secrets Manager client
// When deployed to AWS Amplify, it will use IAM role automatically
const client = new SecretsManagerClient({
  region: process.env.AWS_REGION || 'us-east-1',
  // credentials will be auto-discovered from:
  // 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
  // 2. IAM role (when running on AWS Amplify/EC2/Lambda)
  // 3. AWS credentials file
});

const SECRETS_PREFIX = process.env.SECRETS_PREFIX || 'ai-proxy/';
const CACHE_TTL = parseInt(process.env.SECRETS_CACHE_TTL || '300') * 1000; // 5 minutes default

// In-memory cache
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();

/**
 * Get value from cache if not expired
 */
function getFromCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.value as T;
}

/**
 * Set value in cache with TTL
 */
function setInCache<T>(key: string, value: T): void {
  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL,
  });
}

/**
 * Service Credentials Interface
 */
export interface ServiceCredentials {
  // For API key based services (Anthropic, OpenAI, etc)
  apiKey?: string;

  // For AWS services
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;

  // For other auth methods
  bearerToken?: string;
  username?: string;
  password?: string;

  // Any other custom fields
  [key: string]: any;
}

/**
 * Agent API Key Interface
 */
export interface AgentApiKey {
  id: string;
  key: string; // hashed
  label: string;
  createdAt: string;
  lastUsedAt?: string;
}

/**
 * Get service credentials from Secrets Manager
 */
export async function getServiceCredentials(
  slug: string
): Promise<ServiceCredentials> {
  const secretName = `${SECRETS_PREFIX}services/${slug}`;

  // Check cache first
  const cached = getFromCache<ServiceCredentials>(secretName);
  if (cached) {
    console.log(`[Secrets] Cache hit for service: ${slug}`);
    return cached;
  }

  try {
    console.log(`[Secrets] Fetching service credentials: ${slug}`);

    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await client.send(command);

    if (!response.SecretString) {
      throw new Error(`Secret ${secretName} has no value`);
    }

    const credentials = JSON.parse(response.SecretString) as ServiceCredentials;

    // Cache the result
    setInCache(secretName, credentials);

    return credentials;
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      throw new Error(`Service credentials not found for: ${slug}`);
    }
    throw error;
  }
}

/**
 * Get agent API keys from Secrets Manager
 */
export async function getAgentApiKeys(
  agentId: string
): Promise<AgentApiKey[]> {
  const secretName = `${SECRETS_PREFIX}agents/${agentId}/api-keys`;

  // Check cache first
  const cached = getFromCache<AgentApiKey[]>(secretName);
  if (cached) {
    console.log(`[Secrets] Cache hit for agent: ${agentId}`);
    return cached;
  }

  try {
    console.log(`[Secrets] Fetching agent API keys: ${agentId}`);

    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await client.send(command);

    if (!response.SecretString) {
      throw new Error(`Secret ${secretName} has no value`);
    }

    const data = JSON.parse(response.SecretString);
    const keys = data.keys as AgentApiKey[];

    // Cache the result
    setInCache(secretName, keys);

    return keys;
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      return []; // No keys yet for this agent
    }
    throw error;
  }
}

/**
 * Create or update service credentials in Secrets Manager
 */
export async function createServiceSecret(
  slug: string,
  credentials: ServiceCredentials
): Promise<void> {
  const secretName = `${SECRETS_PREFIX}services/${slug}`;
  const secretString = JSON.stringify(credentials);

  try {
    // Try to update existing secret first
    const updateCommand = new PutSecretValueCommand({
      SecretId: secretName,
      SecretString: secretString,
    });

    await client.send(updateCommand);
    console.log(`[Secrets] Updated service secret: ${slug}`);
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      // Secret doesn't exist, create it
      const createCommand = new CreateSecretCommand({
        Name: secretName,
        SecretString: secretString,
        Description: `Credentials for service: ${slug}`,
      });

      await client.send(createCommand);
      console.log(`[Secrets] Created service secret: ${slug}`);
    } else {
      throw error;
    }
  }

  // Invalidate cache
  cache.delete(secretName);
}

/**
 * Create a new API key for an agent
 */
export async function createAgentApiKey(
  agentId: string,
  label: string
): Promise<{ rawKey: string; hashedKey: string }> {
  const crypto = await import('crypto');

  // Generate random API key
  const rawKey = `agk_${crypto.randomBytes(32).toString('hex')}`;

  // Hash the key for storage
  const hashedKey = crypto
    .createHash('sha256')
    .update(rawKey)
    .digest('hex');

  // Get existing keys
  const existingKeys = await getAgentApiKeys(agentId);

  // Add new key
  const newKey: AgentApiKey = {
    id: crypto.randomBytes(16).toString('hex'),
    key: hashedKey,
    label,
    createdAt: new Date().toISOString(),
  };

  const updatedKeys = [...existingKeys, newKey];

  // Save to Secrets Manager
  const secretName = `${SECRETS_PREFIX}agents/${agentId}/api-keys`;
  const secretString = JSON.stringify({ keys: updatedKeys });

  try {
    // Try to update existing secret
    const updateCommand = new PutSecretValueCommand({
      SecretId: secretName,
      SecretString: secretString,
    });

    await client.send(updateCommand);
    console.log(`[Secrets] Updated agent API keys: ${agentId}`);
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      // Secret doesn't exist, create it
      const createCommand = new CreateSecretCommand({
        Name: secretName,
        SecretString: secretString,
        Description: `API keys for agent: ${agentId}`,
      });

      await client.send(createCommand);
      console.log(`[Secrets] Created agent API keys secret: ${agentId}`);
    } else {
      throw error;
    }
  }

  // Invalidate cache
  cache.delete(secretName);

  return { rawKey, hashedKey };
}

/**
 * List all secrets with a given prefix
 */
export async function listSecrets(prefix?: string): Promise<string[]> {
  const fullPrefix = prefix ? `${SECRETS_PREFIX}${prefix}` : SECRETS_PREFIX;

  try {
    const command = new ListSecretsCommand({
      Filters: [
        {
          Key: 'name',
          Values: [fullPrefix],
        },
      ],
    });

    const response = await client.send(command);

    return (response.SecretList || [])
      .map(secret => secret.Name || '')
      .filter(name => name.startsWith(fullPrefix));
  } catch (error) {
    console.error('[Secrets] Error listing secrets:', error);
    return [];
  }
}

/**
 * Clear the cache (useful for testing or manual refresh)
 */
export function clearCache(): void {
  cache.clear();
  console.log('[Secrets] Cache cleared');
}
