"""
Lambda@Edge Router for Shorlabs Wildcard Subdomains + Custom Domains

This function runs at CloudFront edge locations and routes requests
based on the subdomain or custom domain to the correct user's Lambda function.

Routing priority:
1. *.shorlabs.com → subdomain lookup (existing flow)
2. Any other domain → custom domain lookup via DOMAIN# item (O(1) GetItem)

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
SHORLABS_DOMAIN = 'shorlabs.com'
RESERVED_SUBDOMAINS = {'www', 'api', 'app', 'admin', 'dashboard', 'docs'}

# Subdomains that should be proxied to external services (not user projects)
EXTERNAL_SUBDOMAINS = {
    'accounts': 'accounts.clerk.services',
    'clerk': 'frontend-api.clerk.services',
}


def handler(event, context):
    """
    Origin Request handler for CloudFront.

    Routes requests by:
    1. If Host is *.shorlabs.com → extract subdomain → lookup project
    2. Otherwise → treat as custom domain → lookup DOMAIN# item
    """
    request = event['Records'][0]['cf']['request']
    headers = request['headers']

    host = headers.get('host', [{'value': ''}])[0]['value'].lower().strip()

    # ── Route 1: Shorlabs subdomain routing ──────────────────────
    if host.endswith(f'.{SHORLABS_DOMAIN}'):
        parts = host.split('.')
        if len(parts) < 3:
            return _error_response(404, "Not Found", f"No subdomain specified (host: {host})")

        subdomain = parts[0]

        # Skip reserved subdomains
        if subdomain in RESERVED_SUBDOMAINS:
            return _error_response(400, "Reserved", f"'{subdomain}' is a reserved subdomain")

        # Proxy external subdomains (like accounts -> Clerk)
        if subdomain in EXTERNAL_SUBDOMAINS:
            return _proxy_to_external(request, EXTERNAL_SUBDOMAINS[subdomain])

        # Look up project by subdomain
        project = _lookup_project_by_subdomain(subdomain)
        if not project:
            return _error_response(404, "Not Found", f"No project found for subdomain: {subdomain}")

        return _route_to_lambda(request, project, host)

    # ── Route 2: Custom domain routing ───────────────────────────
    project = _lookup_project_by_custom_domain(host)
    if project:
        return _route_to_lambda(request, project, host)

    return _error_response(404, "Not Found", f"No project found for domain: {host}")


def _route_to_lambda(request: dict, project: dict, original_host: str) -> dict:
    """Rewrite CloudFront origin to a project's Lambda function."""
    lambda_url = project.get('function_url')
    if not lambda_url:
        return _error_response(503, "Not Ready", "Project deployment not complete")

    lambda_domain = lambda_url.replace('https://', '').replace('http://', '').rstrip('/')

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
    request['headers']['host'] = [{'key': 'Host', 'value': lambda_domain}]
    request['headers']['x-forwarded-host'] = [{'key': 'X-Forwarded-Host', 'value': original_host}]

    return request


def _proxy_to_external(request: dict, external_domain: str) -> dict:
    """Proxy request to an external service."""
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
            return items[0]
        return None

    except Exception as e:
        print(f"DynamoDB subdomain lookup error: {e}")
        return None


def _lookup_project_by_custom_domain(domain: str) -> dict | None:
    """
    Look up project by custom domain in DynamoDB.

    Uses direct GetItem on PK=DOMAIN#{domain} — O(1), no scan.
    Only returns projects with ACTIVE status.
    """
    try:
        table = dynamodb.Table(TABLE_NAME)

        response = table.get_item(
            Key={
                'PK': f'DOMAIN#{domain}',
                'SK': 'DOMAIN',
            },
            ProjectionExpression="function_url, #st, project_id",
            ExpressionAttributeNames={"#st": "status"},
        )

        item = response.get('Item')
        if item and item.get('status') == 'ACTIVE':
            return item
        return None

    except Exception as e:
        print(f"DynamoDB custom domain lookup error: {e}")
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
