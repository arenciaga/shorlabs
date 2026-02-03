"""
Lambda@Edge Router for Shorlabs Wildcard Subdomains

This function runs at CloudFront edge locations and routes requests
based on the subdomain to the correct user's Lambda function.

Deployed to us-east-1 (required for Lambda@Edge).

Note: Lambda@Edge has limitations:
- Max 5 seconds timeout for origin-request
- Max 10KB response body for viewer-request
- Limited SDK access (we use DynamoDB directly)
"""

import json
import boto3
from botocore.config import Config


# Configure DynamoDB client for edge
# Note: Lambda@Edge runs in multiple regions, but we always query us-east-1
dynamodb_config = Config(
    region_name='us-east-1',
    connect_timeout=2,
    read_timeout=3,
)
dynamodb = boto3.resource('dynamodb', config=dynamodb_config)

TABLE_NAME = 'shorlabs-projects'
RESERVED_SUBDOMAINS = {'www', 'api', 'app', 'admin', 'dashboard', 'docs'}

# Subdomains that should be proxied to external services (not user projects)
EXTERNAL_SUBDOMAINS = {
    'accounts': 'accounts.clerk.services',
    'clerk': 'frontend-api.clerk.services',
}


def handler(event, context):
    """
    Origin Request handler for CloudFront.
    
    Extracts subdomain from Host header, looks up the project's Lambda URL,
    and rewrites the origin to proxy to the correct Lambda.
    """
    request = event['Records'][0]['cf']['request']
    headers = request['headers']
    
    # Extract subdomain from Host header
    host = headers.get('host', [{'value': ''}])[0]['value']
    
    # Parse subdomain: "my-project.shorlabs.com" -> "my-project"
    parts = host.split('.')
    if len(parts) < 3:
        # Not a subdomain request (e.g., shorlabs.com directly)
        return _error_response(404, "Not Found", f"No subdomain specified (host: {host}, parts: {len(parts)})")
    
    subdomain = parts[0].lower()
    
    # Skip reserved subdomains (return error)
    if subdomain in RESERVED_SUBDOMAINS:
        return _error_response(400, "Reserved", f"'{subdomain}' is a reserved subdomain")

    # Proxy external subdomains (like accounts -> Clerk)
    if subdomain in EXTERNAL_SUBDOMAINS:
        external_domain = EXTERNAL_SUBDOMAINS[subdomain]
        request['origin'] = {
            'custom': {
                'domainName': external_domain,
                'port': 443,
                'protocol': 'https',
                'sslProtocols': ['TLSv1.2'],
                'readTimeout': 30,
                'keepaliveTimeout': 5,
                'customHeaders': {}
            }
        }
        request['headers']['host'] = [{'key': 'Host', 'value': external_domain}]
        return request
    
    # Look up project by subdomain in DynamoDB
    project = _lookup_project_by_subdomain(subdomain)
    
    if not project:
        return _error_response(404, "Not Found", f"No project found for subdomain: {subdomain}")
    
    lambda_url = project.get('function_url')
    if not lambda_url:
        return _error_response(503, "Not Ready", "Project deployment not complete")
    
    # Parse the Lambda URL to get the domain
    # e.g., "https://abc123.lambda-url.us-east-1.on.aws/" -> "abc123.lambda-url.us-east-1.on.aws"
    lambda_domain = lambda_url.replace('https://', '').replace('http://', '').rstrip('/')
    
    # Rewrite the origin to the user's Lambda
    request['origin'] = {
        'custom': {
            'domainName': lambda_domain,
            'port': 443,
            'protocol': 'https',
            'sslProtocols': ['TLSv1.2'],
            'readTimeout': 30,
            'keepaliveTimeout': 5,
            'customHeaders': {}
        }
    }
    
    # Update Host header to match the Lambda URL
    request['headers']['host'] = [{'key': 'Host', 'value': lambda_domain}]
    
    # Add original host as custom header (for logging/debugging)
    request['headers']['x-forwarded-host'] = [{'key': 'X-Forwarded-Host', 'value': host}]
    
    return request


def _lookup_project_by_subdomain(subdomain: str) -> dict | None:
    """
    Look up project by subdomain in DynamoDB.
    
    Uses a table scan with filter - for production scale, add a GSI on subdomain.
    """
    try:
        table = dynamodb.Table(TABLE_NAME)
        
        response = table.scan(
            FilterExpression="subdomain = :sd AND begins_with(SK, :sk_prefix)",
            ExpressionAttributeValues={
                ":sd": subdomain,
                ":sk_prefix": "PROJECT#",
            },
            ProjectionExpression="function_url, subdomain, #st",
            ExpressionAttributeNames={"#st": "status"},
        )
        
        items = response.get('Items', [])
        if items:
            project = items[0]
            # Return project regardless of status - we'll check function_url next
            return project
        return None
        
    except Exception as e:
        print(f"DynamoDB lookup error: {e}")
        return None


def _error_response(status_code: int, status_text: str, message: str) -> dict:
    """Generate an error response."""
    body = json.dumps({
        'error': status_text,
        'message': message,
        'subdomain_routing': True
    })
    
    return {
        'status': str(status_code),
        'statusDescription': status_text,
        'headers': {
            'content-type': [{'key': 'Content-Type', 'value': 'application/json'}],
            'cache-control': [{'key': 'Cache-Control', 'value': 'no-cache'}],
            'access-control-allow-origin': [{'key': 'Access-Control-Allow-Origin', 'value': '*'}],
        },
        'body': body,
    }
