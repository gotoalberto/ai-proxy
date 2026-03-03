/**
 * API Proxy Route Handler
 *
 * Handles all proxy requests to external services.
 * Route: /api/proxy/[slug]/[[...path]]
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateApiKeyAndGetService,
  buildTargetUrl,
  buildProxyHeaders,
  makeProxyRequest,
} from '@/lib/proxy';
import { getServiceCredentials } from '@/lib/aws-secrets';

// Support all HTTP methods
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string; path?: string[] }> }
) {
  return handleProxyRequest(request, context, 'GET');
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string; path?: string[] }> }
) {
  return handleProxyRequest(request, context, 'POST');
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ slug: string; path?: string[] }> }
) {
  return handleProxyRequest(request, context, 'PUT');
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ slug: string; path?: string[] }> }
) {
  return handleProxyRequest(request, context, 'DELETE');
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ slug: string; path?: string[] }> }
) {
  return handleProxyRequest(request, context, 'PATCH');
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ slug: string; path?: string[] }> }
) {
  return handleProxyRequest(request, context, 'HEAD');
}

export async function OPTIONS(
  request: NextRequest,
  context: { params: Promise<{ slug: string; path?: string[] }> }
) {
  return handleProxyRequest(request, context, 'OPTIONS');
}

// Main proxy handler
async function handleProxyRequest(
  request: NextRequest,
  context: { params: Promise<{ slug: string; path?: string[] }> },
  method: string
) {
  const startTime = Date.now();
  let slug = '';
  let path = '';

  try {
    const params = await context.params;
    slug = params.slug;
    const pathSegments = params.path;
    path = pathSegments ? pathSegments.join('/') : '';

    console.log(`[Proxy] ${method} /api/proxy/${slug}/${path}`);

    // Get API key from header or Authorization Bearer
    let apiKey = request.headers.get('X-API-KEY') || request.headers.get('x-api-key');
    const authHeader = request.headers.get('Authorization');

    // Check if Authorization header has an agent token (agk_*)
    if (!apiKey && authHeader && authHeader.startsWith('Bearer agk_')) {
      apiKey = authHeader.replace('Bearer ', '');
    }

    if (!apiKey) {
      console.log('[Proxy] Missing API key');
      return NextResponse.json(
        { error: 'Missing X-API-KEY header or Authorization Bearer with agent token' },
        { status: 401 }
      );
    }

    // Validate API key and get service configuration
    const result = await validateApiKeyAndGetService(apiKey, slug);

    if (!result) {
      console.log('[Proxy] Invalid API key or service');
      return NextResponse.json(
        { error: 'Invalid API key or service' },
        { status: 401 }
      );
    }

    const { service, agentId } = result;

    console.log(`[Proxy] Service: ${service.name}, Agent: ${agentId}`);

    // Get service credentials from Secrets Manager
    const credentials = await getServiceCredentials(slug);

    // Build query parameters object
    const queryParams: Record<string, string | string[]> = {};
    request.nextUrl.searchParams.forEach((value, key) => {
      const existing = queryParams[key];
      if (existing) {
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          queryParams[key] = [existing, value];
        }
      } else {
        queryParams[key] = value;
      }
    });

    // Build target URL
    const authQueryParam = service.authType === 'query' ? service.authQueryParam : undefined;
    const authQueryParamValue =
      service.authType === 'query' && credentials.apiKey
        ? credentials.apiKey
        : undefined;

    const targetUrl = buildTargetUrl(
      service.targetBaseUrl,
      path,
      queryParams,
      authQueryParam,
      authQueryParamValue
    );

    // Build headers for proxy request
    const originalHeaders: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      originalHeaders[key] = value;
    });

    // Get auth header value based on auth type
    let authHeaderValue: string | undefined;
    if (service.authType === 'header' && credentials.apiKey) {
      authHeaderValue = credentials.apiKey;
    } else if (service.authType === 'bearer' && credentials.apiKey) {
      authHeaderValue = credentials.apiKey;
    }

    const proxyHeaders = buildProxyHeaders(
      originalHeaders,
      service.authType,
      service.authHeader,
      authHeaderValue
    );

    // Get request body if applicable
    let body = undefined;
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const contentType = request.headers.get('content-type') || '';

      try {
        if (contentType.includes('application/json')) {
          body = await request.json();
        } else if (contentType.includes('text/')) {
          body = await request.text();
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          body = await request.text();
        } else {
          // For other content types, get the raw body
          body = await request.arrayBuffer();
        }
      } catch (error) {
        console.log('[Proxy] Could not parse request body');
        // Continue without body if parsing fails
      }
    }

    // Make the proxy request
    const response = await makeProxyRequest(
      targetUrl,
      method,
      proxyHeaders,
      body,
      service.slug,
      service,
      credentials
    );

    // Handle streaming responses (for LLM APIs)
    const contentType = response.headers.get('content-type') || '';

    // For streaming responses
    if (response.body && contentType.includes('text/event-stream')) {
      return new NextResponse(response.body, {
        status: response.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    // For regular responses
    let responseBody;
    try {
      if (contentType.includes('application/json')) {
        responseBody = await response.json();
      } else if (contentType.includes('text/')) {
        responseBody = await response.text();
      } else {
        responseBody = await response.arrayBuffer();
      }
    } catch (error) {
      console.error('[Proxy] Error reading response body:', error);
      responseBody = null;
    }

    const duration = Date.now() - startTime;
    console.log(`[Proxy] Request completed in ${duration}ms with status ${response.status}`);

    // Return the proxied response
    return new NextResponse(
      responseBody instanceof ArrayBuffer ? responseBody : JSON.stringify(responseBody),
      {
        status: response.status,
        headers: {
          'Content-Type': contentType || 'application/json',
        },
      }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[Proxy] Request failed:', error);

    // Return appropriate error response
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: 'Internal proxy error' }, { status: 500 });
  }
}
