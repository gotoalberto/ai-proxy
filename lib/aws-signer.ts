import { SignatureV4 } from '@smithy/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-js';

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export interface SignedRequestParams {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string | Buffer;
  credentials: AwsCredentials;
  service: string;
}

/**
 * Sign an HTTP request using AWS Signature V4
 */
export async function signAwsRequest(params: SignedRequestParams): Promise<{
  url: string;
  headers: Record<string, string>;
  body?: string | Buffer;
}> {
  const { method, url, headers, body, credentials, service } = params;

  // Parse the URL
  const urlObj = new URL(url);

  // Headers that should NOT be included in AWS signature
  const excludedHeaders = [
    'x-vercel-',
    'x-forwarded-',
    'x-real-ip',
    'x-nextjs-',
    'x-matched-path',
    'x-invocation-id',
    'forwarded',
    'x-content-type-options',
    'user-agent',
    'accept-encoding',
    'accept'
  ];

  // Filter headers - only keep headers that are safe for AWS signing
  const filteredHeaders: Record<string, string> = {
    host: urlObj.hostname,
  };

  // Only include content-type and other essential headers
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();

    // Skip excluded headers
    const shouldExclude = excludedHeaders.some(prefix => lowerKey.startsWith(prefix));
    if (shouldExclude) continue;

    // Only include essential headers
    if (lowerKey === 'content-type' ||
        lowerKey === 'content-length' ||
        lowerKey === 'content-md5' ||
        lowerKey.startsWith('x-amz-')) {
      filteredHeaders[key] = value;
    }
  }

  // Parse query parameters
  const query: Record<string, string> = {};
  urlObj.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  // Create the HTTP request object
  const request = new HttpRequest({
    method,
    protocol: urlObj.protocol,
    hostname: urlObj.hostname,
    port: urlObj.port ? parseInt(urlObj.port) : undefined,
    path: urlObj.pathname,
    query, // Pass query params separately for proper sorting
    headers: filteredHeaders,
    body,
  });

  // Create the signer
  const signer = new SignatureV4({
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
    region: credentials.region,
    service,
    sha256: Sha256,
  });

  // Sign the request
  const signedRequest = await signer.sign(request);

  // Extract the signed headers
  const signedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(signedRequest.headers)) {
    signedHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
  }

  // Rebuild URL with query parameters
  let finalUrl = `${signedRequest.protocol}//${signedRequest.hostname}`;
  if (signedRequest.port) {
    finalUrl += `:${signedRequest.port}`;
  }
  finalUrl += signedRequest.path;

  // Add query parameters if they exist
  if (signedRequest.query && Object.keys(signedRequest.query).length > 0) {
    const queryString = Object.entries(signedRequest.query)
      .map(([key, value]) => {
        // Handle array values
        if (Array.isArray(value)) {
          return value.map(v => `${encodeURIComponent(key)}=${encodeURIComponent(v)}`).join('&');
        }
        // Handle null/undefined
        if (value === null || value === undefined) {
          return encodeURIComponent(key);
        }
        // Handle string/number/boolean
        return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
      })
      .join('&');
    finalUrl += `?${queryString}`;
  }

  return {
    url: finalUrl,
    headers: signedHeaders,
    body: signedRequest.body,
  };
}

/**
 * Parse AWS credentials from service authHeaderValue
 */
export function parseAwsCredentials(authHeaderValue: string | null): AwsCredentials | null {
  if (!authHeaderValue) return null;

  try {
    const parsed = JSON.parse(authHeaderValue);
    if (parsed.accessKeyId && parsed.secretAccessKey && parsed.region) {
      return {
        accessKeyId: parsed.accessKeyId,
        secretAccessKey: parsed.secretAccessKey,
        region: parsed.region,
      };
    }
  } catch (e) {
    // Not JSON or invalid format
  }

  return null;
}

/**
 * Extract AWS service name from slug
 * Examples: aws-s3 -> s3, aws-dynamodb -> dynamodb
 */
export function extractAwsServiceName(slug: string): string | null {
  if (!slug.startsWith('aws-')) return null;

  const serviceName = slug.substring(4); // Remove 'aws-' prefix

  // Map some slugs to their correct service names
  const serviceMap: Record<string, string> = {
    's3': 's3',
    'lambda': 'lambda',
    'dynamodb': 'dynamodb',
    'ec2': 'ec2',
    'ecs': 'ecs',
    'eks': 'eks',
    'rds': 'rds',
    'sqs': 'sqs',
    'sns': 'sns',
    'cloudwatch': 'monitoring',
    'cloudfront': 'cloudfront',
    'route53': 'route53',
    'apigateway': 'apigateway',
    'elb': 'elasticloadbalancing',
    'iam': 'iam',
    'kms': 'kms',
    'secrets': 'secretsmanager',
    'cognito': 'cognito-idp',
    'cloudtrail': 'cloudtrail',
    'cloudformation': 'cloudformation',
    'ssm': 'ssm',
    'eventbridge': 'events',
    'stepfunctions': 'states',
    'athena': 'athena',
    'kinesis': 'kinesis',
    'emr': 'elasticmapreduce',
    'glue': 'glue',
    'sagemaker': 'sagemaker',
    'rekognition': 'rekognition',
    'comprehend': 'comprehend',
    'transcribe': 'transcribe',
    'polly': 'polly',
    'translate': 'translate',
    'codebuild': 'codebuild',
    'codedeploy': 'codedeploy',
    'codepipeline': 'codepipeline',
    'ses': 'ses',
    'bedrock': 'bedrock-runtime',
    'ebs': 'ebs',
    'efs': 'elasticfilesystem',
    'glacier': 'glacier',
    'elasticache': 'elasticache',
    'redshift': 'redshift',
    'documentdb': 'rds',
    'vpc': 'ec2',
  };

  return serviceMap[serviceName] || serviceName;
}
