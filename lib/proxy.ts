/**
 * Proxy Logic
 *
 * Handles request validation, authentication, and proxying to target services.
 * Uses AWS Secrets Manager for credentials instead of a database.
 */

import axios from 'axios';
import { getServiceCredentials, getAgentApiKeys, type AgentApiKey } from './aws-secrets';
import { getServiceConfig, listAgents, agentHasAccessToService } from './config-loader';
import { signAwsRequest, parseAwsCredentials, extractAwsServiceName } from './aws-signer';
import type { ServiceConfig } from '@/types';

/**
 * Hash API key using SHA256
 */
export function hashApiKey(apiKey: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Validate API key and get service
 * Returns service config and agent info if valid
 */
export async function validateApiKeyAndGetService(
  apiKey: string,
  serviceSlug: string
): Promise<{ service: ServiceConfig; agentId: string } | null> {
  console.log('[Proxy] Validating API key for service:', serviceSlug);

  const hashedKey = hashApiKey(apiKey);

  // Get service configuration
  const service = await getServiceConfig(serviceSlug);
  if (!service) {
    console.log('[Proxy] Service not found:', serviceSlug);
    return null;
  }

  // Check all agents to find one with this API key
  const agents = await listAgents();

  for (const agent of agents) {
    try {
      const apiKeys = await getAgentApiKeys(agent.id);

      // Check if this agent has this API key
      const matchingKey = apiKeys.find((k: AgentApiKey) => k.key === hashedKey);

      if (matchingKey) {
        // Check if agent has access to this service
        const hasAccess = await agentHasAccessToService(agent.id, serviceSlug);

        if (hasAccess) {
          console.log('[Proxy] Valid API key found for agent:', agent.name);
          return { service, agentId: agent.id };
        } else {
          console.log('[Proxy] Agent does not have access to service');
          return null;
        }
      }
    } catch (error) {
      console.error('[Proxy] Error checking agent:', agent.id, error);
      // Continue checking other agents
    }
  }

  console.log('[Proxy] No matching API key found');
  return null;
}

/**
 * Build the target URL with query parameters
 */
export function buildTargetUrl(
  baseUrl: string,
  path: string,
  queryParams: Record<string, string | string[]>,
  authQueryParam?: string,
  authQueryParamValue?: string
): string {
  // Remove leading slash from path if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  // Ensure base URL doesn't end with slash
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  // Build the URL
  const url = new URL(`${cleanBaseUrl}/${cleanPath}`);

  // Add original query params
  Object.entries(queryParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(v => url.searchParams.append(key, v));
    } else {
      url.searchParams.append(key, value);
    }
  });

  // Add auth query param if configured
  if (authQueryParam && authQueryParamValue) {
    url.searchParams.set(authQueryParam, authQueryParamValue);
  }

  return url.toString();
}

/**
 * Build headers for the proxy request
 */
export function buildProxyHeaders(
  originalHeaders: Record<string, string>,
  authType: string,
  authHeader?: string,
  authHeaderValue?: string
): Record<string, string> {
  // Headers to skip
  const skipHeaders = [
    'host',
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
    'content-length',
  ];

  const headers: Record<string, string> = {};

  // Copy headers except the ones we need to skip
  Object.entries(originalHeaders).forEach(([key, value]) => {
    const lowerKey = key.toLowerCase();

    if (skipHeaders.includes(lowerKey)) {
      return;
    }

    // Skip x-api-key if it's an agent token (agk_*)
    if (lowerKey === 'x-api-key' && value.startsWith('agk_')) {
      console.log('[Proxy] Skipping gateway API key');
      return;
    }

    // Skip Authorization if it contains agent token
    if (lowerKey === 'authorization' && value.includes('agk_')) {
      console.log('[Proxy] Skipping gateway Authorization');
      return;
    }

    headers[key] = value;
  });

  // Add service authentication based on type
  if (authType === 'header' && authHeader && authHeaderValue) {
    headers[authHeader] = authHeaderValue;
  } else if (authType === 'bearer' && authHeaderValue) {
    headers['Authorization'] = `Bearer ${authHeaderValue}`;
  }

  return headers;
}

/**
 * Make the proxy request to the target service
 */
export async function makeProxyRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: any,
  serviceSlug?: string,
  serviceConfig?: ServiceConfig,
  credentials?: any
): Promise<Response> {
  try {
    // Ensure we have a proper User-Agent header
    if (!headers['User-Agent'] && !headers['user-agent']) {
      headers['User-Agent'] =
        'Mozilla/5.0 (compatible; AIProxy/1.0; +https://github.com/gotoalberto/ai-proxy)';
    }

    console.log('[Proxy] Making request to:', url);
    console.log('[Proxy] Method:', method);

    // Check if this is an AWS service that needs SigV4 signing
    const awsServiceName = serviceSlug ? extractAwsServiceName(serviceSlug) : null;
    const awsCredentials = credentials ? parseAwsCredentials(JSON.stringify(credentials)) : null;

    if (awsServiceName && awsCredentials) {
      console.log('[Proxy] Signing AWS request with SigV4');
      console.log('[Proxy] AWS Service:', awsServiceName);

      // Sign the request with AWS SigV4
      const signedRequest = await signAwsRequest({
        method,
        url,
        headers,
        body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
        credentials: awsCredentials,
        service: awsServiceName,
      });

      // Use the signed request
      url = signedRequest.url;
      headers = signedRequest.headers;
      body = signedRequest.body;

      console.log('[Proxy] Request signed successfully');
    }

    const axiosConfig: any = {
      method,
      url,
      headers,
      validateStatus: () => true, // Don't throw on any status code
      timeout: 30000, // 30 second timeout
    };

    // Add body for methods that support it
    if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      axiosConfig.data = body;
    }

    const axiosResponse = await axios(axiosConfig);

    // Convert axios response to Response-like object
    const responseHeaders = new Headers();
    Object.entries(axiosResponse.headers).forEach(([key, value]) => {
      if (value) {
        responseHeaders.set(key, String(value));
      }
    });

    // Create a Response-compatible object
    const response = new Response(
      typeof axiosResponse.data === 'string'
        ? axiosResponse.data
        : JSON.stringify(axiosResponse.data),
      {
        status: axiosResponse.status,
        statusText: axiosResponse.statusText,
        headers: responseHeaders,
      }
    );

    return response;
  } catch (error) {
    console.error('[Proxy] Request failed:', error);
    throw new Error(
      `Failed to connect to upstream service: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}
