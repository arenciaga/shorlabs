"""
Domain service for Shorlabs custom domain management.

Uses CloudFront SaaS Manager (multi-tenant distributions) for scalable
per-domain SSL certificate provisioning and routing.

Architecture:
  - Multi-tenant distribution: shared config (cache, Lambda@Edge, origin)
  - Distribution tenant: per-custom-domain entry with managed ACM cert
  - Routing endpoint: shared CloudFront domain (CNAME target for all custom domains)
  - CloudFront auto-provisions and auto-renews ACM certs via HTTP validation
"""
import os
import re
import socket
from typing import Optional

import boto3
from botocore.config import Config


# AWS clients (us-east-1 required for ACM + CloudFront)
cloudfront_client = boto3.client("cloudfront", region_name="us-east-1")

# CloudFront SaaS Manager configuration
CLOUDFRONT_MULTITENANT_DISTRIBUTION_ID = os.environ.get(
    "CLOUDFRONT_MULTITENANT_DISTRIBUTION_ID", "E3F7KIH2D9069"
)
CLOUDFRONT_ROUTING_ENDPOINT = os.environ.get(
    "CLOUDFRONT_ROUTING_ENDPOINT", "d34dyjn0btmcwo.cloudfront.net"
)
# CNAME target that users point their custom domains to
# This should be the routing endpoint from the tenant
CNAME_TARGET = os.environ.get("CNAME_TARGET", CLOUDFRONT_ROUTING_ENDPOINT or "cname.shorlabs.com")

# Domain validation regex
DOMAIN_REGEX = re.compile(
    r"^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$"
)

def validate_domain_format(domain: str) -> bool:
    """Check if a domain string is valid."""
    return bool(DOMAIN_REGEX.match(domain))


def is_apex_domain(domain: str) -> bool:
    """Check if domain is an apex/root domain (e.g., example.com vs sub.example.com)."""
    parts = domain.split(".")
    return len(parts) == 2


# ─────────────────────────────────────────────────────────────
# DNS VERIFICATION
# ─────────────────────────────────────────────────────────────


def verify_domain_dns(domain: str, expected_target: str = None) -> dict:
    """
    Verify that a domain's DNS is correctly pointing to Shorlabs.

    Checks CNAME records for subdomains, A/CNAME for apex domains.
    Uses dnspython for reliable DNS lookups.

    Returns:
        {
            "verified": bool,
            "record_type": str | None,
            "current_value": str | None,
            "expected_value": str,
            "error": str | None,
        }
    """
    if expected_target is None:
        expected_target = CNAME_TARGET

    try:
        import dns.resolver

        # Try CNAME first (works for subdomains and CNAME-flattened apex domains)
        try:
            answers = dns.resolver.resolve(domain, "CNAME")
            for rdata in answers:
                cname_value = str(rdata.target).rstrip(".")
                # Match either the routing endpoint or the legacy cname target
                if (cname_value.lower() == expected_target.lower() or 
                    cname_value.lower() == CLOUDFRONT_ROUTING_ENDPOINT.lower()):
                    return {
                        "verified": True,
                        "record_type": "CNAME",
                        "current_value": cname_value,
                        "expected_value": expected_target,
                        "error": None,
                    }
            # CNAME exists but points elsewhere
            return {
                "verified": False,
                "record_type": "CNAME",
                "current_value": str(answers[0].target).rstrip("."),
                "expected_value": expected_target,
                "error": f"CNAME points to {str(answers[0].target).rstrip('.')} instead of {expected_target}",
            }
        except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
            pass
        except Exception:
            pass

        # For apex domains, check if it resolves to our CloudFront IP
        # (via A record / ALIAS / CNAME flattening)
        try:
            answers = dns.resolver.resolve(domain, "A")
            # We can't easily verify A records match CloudFront (dynamic IPs),
            # but we can check if the domain resolves at all
            a_value = str(answers[0].address)
            return {
                "verified": False,
                "record_type": "A",
                "current_value": a_value,
                "expected_value": expected_target,
                "error": f"Domain has an A record ({a_value}) but should have a CNAME to {expected_target}. "
                         f"If using an apex domain, use a DNS provider that supports CNAME flattening (e.g., Cloudflare).",
            }
        except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
            pass

        return {
            "verified": False,
            "record_type": None,
            "current_value": None,
            "expected_value": expected_target,
            "error": "No DNS records found. Add a CNAME record pointing to " + expected_target,
        }

    except ImportError:
        # Fallback: use socket-based resolution (less precise but works without dnspython)
        return _verify_dns_fallback(domain, expected_target)


def _verify_dns_fallback(domain: str, expected_target: str) -> dict:
    """Fallback DNS verification using socket (when dnspython not available)."""
    try:
        socket.getaddrinfo(domain, 443)
        # Domain resolves, but we can't verify CNAME without dnspython
        return {
            "verified": False,
            "record_type": "unknown",
            "current_value": "resolves",
            "expected_value": expected_target,
            "error": "DNS resolves but cannot verify CNAME target without dnspython. "
                     "Install dnspython for proper verification.",
        }
    except socket.gaierror:
        return {
            "verified": False,
            "record_type": None,
            "current_value": None,
            "expected_value": expected_target,
            "error": "Domain does not resolve. Add a CNAME record pointing to " + expected_target,
        }


# ─────────────────────────────────────────────────────────────
# CLOUDFRONT SAAS MANAGER — DISTRIBUTION TENANTS
# ─────────────────────────────────────────────────────────────


def create_domain_tenant(domain: str, project_id: str) -> dict:
    """
    Create a CloudFront distribution tenant for a custom domain.

    CloudFront SaaS Manager automatically provisions and manages
    an ACM certificate for the domain via HTTP validation. 
    
    IMPORTANT: The user MUST point their domain's DNS to the routing 
    endpoint BEFORE calling this function. CloudFront validates domain 
    ownership by checking if the DNS points to CloudFront.

    Workflow:
    1. User adds domain to your platform
    2. You show them: "Point your DNS to: d34dyjn0btmcwo.cloudfront.net"
    3. You verify DNS is pointed (using verify_domain_dns)
    4. THEN you call this function to create the tenant
    5. CloudFront validates ownership and provisions SSL automatically

    Args:
        domain: The custom domain (e.g., www.example.com)
        project_id: The Shorlabs project ID (for tagging)

    Returns:
        {
            "tenant_id": str,
            "routing_endpoint": str,
            "status": str,
            "success": bool,
            "error": str | None,
        }
    """
    if not CLOUDFRONT_MULTITENANT_DISTRIBUTION_ID:
        print("CLOUDFRONT_MULTITENANT_DISTRIBUTION_ID not set, skipping tenant creation")
        return {
            "tenant_id": None,
            "routing_endpoint": None,
            "status": "FAILED",
            "success": False,
            "error": "CloudFront multi-tenant distribution not configured",
        }

    try:
        # Build tenant name from domain (must match [a-zA-Z0-9][a-zA-Z0-9-.]{1,126}[a-zA-Z0-9])
        tenant_name = f"tenant-{domain.replace('.', '-')}"
        # Ensure it starts and ends with alphanumeric
        tenant_name = tenant_name.strip("-")

        create_params = {
            "DistributionId": CLOUDFRONT_MULTITENANT_DISTRIBUTION_ID,
            "Name": tenant_name,
            "Domains": [{"Domain": domain}],
            "ManagedCertificateRequest": {
                # REQUIRED: How CloudFront will validate the certificate
                # "cloudfront" = CloudFront serves validation token automatically
                # "self-hosted" = You serve validation token from your existing server
                "ValidationTokenHost": "cloudfront",
                "CertificateTransparencyLoggingPreference": "enabled",
            },
            "Enabled": True,
            "Tags": {
                "Items": [
                    {"Key": "Service", "Value": "shorlabs"},
                    {"Key": "ProjectId", "Value": project_id},
                    {"Key": "Domain", "Value": domain},
                ]
            },
        }

        response = cloudfront_client.create_distribution_tenant(**create_params)

        tenant = response["DistributionTenant"]
        tenant_id = tenant["Id"]
        status = tenant.get("Status", "InProgress")
        routing_endpoint = tenant.get("RoutingDomain", CLOUDFRONT_ROUTING_ENDPOINT)

        print(f"Created CloudFront tenant {tenant_id} for domain {domain} (status: {status})")
        print(f"User should CNAME {domain} → {routing_endpoint}")

        return {
            "tenant_id": tenant_id,
            "routing_endpoint": routing_endpoint,
            "status": status,
            "success": True,
            "error": None,
        }

    except Exception as e:
        print(f"Failed to create CloudFront tenant for {domain}: {e}")
        return {
            "tenant_id": None,
            "routing_endpoint": None,
            "status": "FAILED",
            "success": False,
            "error": str(e),
        }


def get_domain_tenant_status(tenant_id: str) -> dict:
    """
    Check the status of a CloudFront distribution tenant.

    Returns:
        {
            "status": str,           # e.g., "Deployed", "InProgress", "Failed"
            "enabled": bool,
            "domains": list,         # [{"Domain": str, "Status": str}]
            "routing_endpoint": str, # The CloudFront domain to CNAME to
            "error": str | None,
        }
    """
    try:
        response = cloudfront_client.get_distribution_tenant(
            DistributionId=CLOUDFRONT_MULTITENANT_DISTRIBUTION_ID,
            TenantId=tenant_id
        )
        tenant = response["DistributionTenant"]

        return {
            "status": tenant.get("Status", "Unknown"),
            "enabled": tenant.get("Enabled", False),
            "domains": tenant.get("Domains", []),
            "routing_endpoint": tenant.get("RoutingDomain", CLOUDFRONT_ROUTING_ENDPOINT),
            "error": None,
        }

    except Exception as e:
        print(f"Failed to get tenant status for {tenant_id}: {e}")
        return {
            "status": "ERROR",
            "enabled": False,
            "domains": [],
            "routing_endpoint": CLOUDFRONT_ROUTING_ENDPOINT,
            "error": str(e),
        }


def delete_domain_tenant(tenant_id: str) -> bool:
    """
    Delete a CloudFront distribution tenant.

    This removes the custom domain from CloudFront and its managed
    ACM certificate will be cleaned up automatically.

    Args:
        tenant_id: The CloudFront distribution tenant ID

    Returns:
        True if deleted successfully, False otherwise
    """
    try:
        # First, get the tenant to get ETag
        resp = cloudfront_client.get_distribution_tenant(
            DistributionId=CLOUDFRONT_MULTITENANT_DISTRIBUTION_ID,
            TenantId=tenant_id
        )
        tenant = resp["DistributionTenant"]
        etag = resp["ETag"]

        # Disable the tenant first if it's enabled
        if tenant.get("Enabled", True):
            cloudfront_client.update_distribution_tenant(
                DistributionId=CLOUDFRONT_MULTITENANT_DISTRIBUTION_ID,
                TenantId=tenant_id,
                IfMatch=etag,
                Name=tenant["Name"],
                Domains=tenant["Domains"],
                Enabled=False,
            )
            # Re-fetch to get new ETag after disabling
            resp = cloudfront_client.get_distribution_tenant(
                DistributionId=CLOUDFRONT_MULTITENANT_DISTRIBUTION_ID,
                TenantId=tenant_id
            )
            etag = resp["ETag"]

        # Now delete the disabled tenant
        cloudfront_client.delete_distribution_tenant(
            DistributionId=CLOUDFRONT_MULTITENANT_DISTRIBUTION_ID,
            TenantId=tenant_id,
            IfMatch=etag,
        )

        print(f"Deleted CloudFront tenant {tenant_id}")
        return True

    except cloudfront_client.exceptions.NoSuchDistributionTenant:
        print(f"Tenant {tenant_id} already deleted")
        return True

    except Exception as e:
        print(f"Failed to delete CloudFront tenant {tenant_id}: {e}")
        return False


def get_cname_instructions(domain: str) -> dict:
    """
    Get DNS setup instructions for a custom domain.

    Returns:
        {
            "domain": str,
            "record_type": str,      # "CNAME" or "A (Alias)"
            "record_name": str,      # What to enter in DNS (e.g., "www" or "@")
            "record_value": str,     # Where to point (routing endpoint)
            "instructions": str,     # Human-readable instructions
        }
    """
    is_apex = is_apex_domain(domain)
    
    if is_apex:
        # Apex domain - user needs ALIAS or CNAME flattening
        record_name = "@"
        instructions = (
            f"Add an ALIAS record (or CNAME with flattening) for your apex domain:\n"
            f"  Type: A (Alias) or CNAME\n"
            f"  Name: @ (or leave blank)\n"
            f"  Value: {CLOUDFRONT_ROUTING_ENDPOINT}\n\n"
            f"Note: Some DNS providers (GoDaddy, traditional) don't support CNAME for apex domains. "
            f"Consider using Cloudflare, AWS Route 53, or another provider with CNAME flattening support."
        )
    else:
        # Subdomain - standard CNAME works
        subdomain_part = domain.split('.')[0]
        record_name = subdomain_part
        instructions = (
            f"Add a CNAME record for your subdomain:\n"
            f"  Type: CNAME\n"
            f"  Name: {subdomain_part}\n"
            f"  Value: {CLOUDFRONT_ROUTING_ENDPOINT}\n"
            f"  TTL: 3600 (or default)"
        )
    
    return {
        "domain": domain,
        "record_type": "CNAME" if not is_apex else "A (Alias)",
        "record_name": record_name,
        "record_value": CLOUDFRONT_ROUTING_ENDPOINT,
        "instructions": instructions,
    }