"""
Custom domain API routes for Shorlabs.

Implements a streamlined custom domain flow using CloudFront SaaS Manager:
1. User adds domain → gets DNS instructions (CNAME to connection group)
2. User adds DNS record at registrar
3. User clicks Verify → system checks DNS, creates CloudFront tenant
4. CloudFront auto-provisions SSL cert → domain goes ACTIVE
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.auth import get_current_user_id
from api.db.dynamodb import (
    get_project_by_key,
    get_domain_item,
    add_custom_domain,
    update_domain,
    delete_domain_item,
    list_project_domains,
    CNAME_TARGET,
)
from api.services.domain_service import (
    validate_domain_format,
    is_apex_domain,
    verify_domain_dns,
    create_domain_tenant,
    complete_domain_setup,
    get_domain_tenant_status,
    delete_domain_tenant,
)

router = APIRouter(prefix="/api/projects/{project_id}/domains", tags=["domains"])


class AddDomainRequest(BaseModel):
    domain: str


# ─────────────────────────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────────────────────────


@router.post("")
async def add_domain(
    project_id: str,
    request: AddDomainRequest,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """
    Add a custom domain to a project.

    Returns DNS instructions for the user to configure at their registrar.
    The user needs to add a single CNAME record — no separate SSL step needed.
    """
    # Auth: verify project belongs to org
    project = get_project_by_key(org_id, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    domain = request.domain.lower().strip()

    # Validate domain format
    if not validate_domain_format(domain):
        raise HTTPException(status_code=400, detail="Invalid domain format")

    # Check domain is not already in use
    existing = get_domain_item(domain)
    if existing:
        if existing.get("project_id") == project_id:
            raise HTTPException(status_code=409, detail="Domain already added to this project")
        raise HTTPException(status_code=409, detail="Domain is already in use by another project")

    # Create domain item
    domain_item = add_custom_domain(
        org_id=org_id,
        project_id=project_id,
        domain=domain,
        function_url=project.get("function_url"),
    )

    # Build DNS instructions
    apex = is_apex_domain(domain)
    dns_instructions = {
        "type": "CNAME",
        "name": domain if apex else domain.split(".")[0],
        "value": CNAME_TARGET,
    }

    return {
        "domain": domain,
        "status": domain_item["status"],
        "dns_instructions": dns_instructions,
        "is_apex_domain": apex,
        "message": (
            f"Add a CNAME record pointing {domain} to {CNAME_TARGET}. "
            "If using an apex domain, use a DNS provider that supports CNAME flattening (e.g., Cloudflare). "
            "Once added, click Verify DNS — SSL will be provisioned automatically."
        ),
    }


@router.post("/{domain}/verify")
async def verify_domain(
    project_id: str,
    domain: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """
    Verify DNS configuration and activate a custom domain.

    If DNS is verified, creates a CloudFront distribution tenant.
    CloudFront automatically provisions an SSL certificate via HTTP validation.
    No separate SSL step needed — the domain goes directly to ACTIVE.
    """
    # Auth
    project = get_project_by_key(org_id, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    domain = domain.lower().strip()
    domain_item = get_domain_item(domain)
    if not domain_item:
        raise HTTPException(status_code=404, detail="Domain not found on this project")
    if domain_item.get("project_id") != project_id:
        raise HTTPException(status_code=403, detail="Domain belongs to another project")

    # Check DNS
    dns_result = verify_domain_dns(domain)

    if not dns_result["verified"]:
        return {
            "domain": domain,
            "dns_verified": False,
            "status": "PENDING_VERIFICATION",
            "dns_result": dns_result,
            "message": dns_result.get("error", "DNS not configured correctly"),
        }

    # DNS verified — create CloudFront distribution tenant
    # CloudFront will auto-provision the SSL certificate
    current_status = domain_item.get("status")
    tenant_id = domain_item.get("tenant_id")

    if current_status == "ACTIVE" and tenant_id:
        # Already active
        return {
            "domain": domain,
            "dns_verified": True,
            "status": "ACTIVE",
            "is_active": True,
            "message": "Domain is already active and serving traffic.",
        }

    if not tenant_id:
        # Create new CloudFront tenant
        tenant_result = create_domain_tenant(domain, project_id)

        if not tenant_result["success"]:
            error_msg = tenant_result.get("error", "Unknown error")
            update_domain(domain, {"status": "FAILED"})
            return {
                "domain": domain,
                "dns_verified": True,
                "status": "FAILED",
                "is_active": False,
                "message": f"DNS verified but CloudFront activation failed: {error_msg}. "
                           "Please try again or contact support.",
            }

        # Tenant created — set to PROVISIONING (cert still pending)
        update_domain(domain, {
            "status": "PROVISIONING",
            "tenant_id": tenant_result["tenant_id"],
            "function_url": project.get("function_url"),
        })
        tenant_id = tenant_result["tenant_id"]

        # Fall through to the setup attempt below

    # Tenant exists — try to complete domain setup (associate cert)
    setup_result = complete_domain_setup(tenant_id, domain)

    if setup_result["success"] and setup_result["domain_status"] == "active":
        update_domain(domain, {
            "status": "ACTIVE",
            "function_url": project.get("function_url"),
        })
        return {
            "domain": domain,
            "dns_verified": True,
            "status": "ACTIVE",
            "is_active": True,
            "message": "Domain setup completed! SSL certificate is active.",
        }

    # Cert not ready yet — keep as PROVISIONING
    cert_status = setup_result.get("certificate_status", "unknown")
    current_db_status = get_domain_item(domain).get("status", "PROVISIONING") if get_domain_item(domain) else "PROVISIONING"
    if current_db_status not in ("ACTIVE",):
        update_domain(domain, {"status": "PROVISIONING"})

    return {
        "domain": domain,
        "dns_verified": True,
        "status": "PROVISIONING",
        "is_active": False,
        "certificate_status": cert_status,
        "message": (
            "DNS verified! SSL certificate is being provisioned. "
            "This typically takes 1-5 minutes. The domain will activate automatically."
        ),
    }


@router.get("/{domain}/status")
async def check_domain_status(
    project_id: str,
    domain: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """
    Check the current status of a custom domain.

    If a CloudFront tenant exists, checks its deployment status.
    """
    # Auth
    project = get_project_by_key(org_id, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    domain = domain.lower().strip()
    domain_item = get_domain_item(domain)
    if not domain_item:
        raise HTTPException(status_code=404, detail="Domain not found")
    if domain_item.get("project_id") != project_id:
        raise HTTPException(status_code=403, detail="Domain belongs to another project")

    current_status = domain_item.get("status")
    tenant_id = domain_item.get("tenant_id")

    # If already active, verify the tenant is still healthy
    if current_status == "ACTIVE" and tenant_id:
        tenant_status = get_domain_tenant_status(tenant_id)
        cf_status = tenant_status.get("status", "Unknown")

        if cf_status in ("Deployed", "InProgress"):
            return {
                "domain": domain,
                "status": "ACTIVE",
                "is_active": True,
                "cloudfront_status": cf_status,
                "message": "Domain is active and serving traffic.",
            }
        else:
            # Tenant has issues
            return {
                "domain": domain,
                "status": "ACTIVE",
                "is_active": True,
                "cloudfront_status": cf_status,
                "message": f"Domain is active but CloudFront status is: {cf_status}",
            }

    # If we have a tenant but status isn't ACTIVE, try completing setup
    if tenant_id and current_status != "ACTIVE":
        # Try to complete domain setup (verify DNS + trigger cert association)
        setup_result = complete_domain_setup(tenant_id, domain)

        if setup_result["success"] and setup_result["domain_status"] == "active":
            update_domain(domain, {
                "status": "ACTIVE",
                "function_url": project.get("function_url"),
            })
            return {
                "domain": domain,
                "status": "ACTIVE",
                "is_active": True,
                "message": "Domain setup completed! SSL certificate is active.",
            }
        else:
            # Still provisioning
            cert_status = setup_result.get("certificate_status", "unknown")
            return {
                "domain": domain,
                "status": "PROVISIONING",
                "is_active": False,
                "certificate_status": cert_status,
                "message": (
                    "SSL certificate is being provisioned. "
                    "This typically takes 1-5 minutes."
                ),
            }

    # No tenant — still pending DNS verification
    return {
        "domain": domain,
        "status": current_status or "PENDING_VERIFICATION",
        "is_active": False,
        "message": "Domain is pending DNS verification. Add the CNAME record and click Verify.",
    }


@router.get("")
async def list_domains(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """List all custom domains for a project."""
    project = get_project_by_key(org_id, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    domains = list_project_domains(project_id)
    return [
        {
            "domain": d.get("domain"),
            "status": d.get("status"),
            "is_active": d.get("status") == "ACTIVE",
            "tenant_id": d.get("tenant_id"),
            "created_at": d.get("created_at"),
        }
        for d in domains
    ]


@router.delete("/{domain}")
async def remove_domain(
    project_id: str,
    domain: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """
    Remove a custom domain from a project.

    Cleans up CloudFront distribution tenant and DynamoDB item.
    """
    project = get_project_by_key(org_id, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    domain = domain.lower().strip()
    domain_item = get_domain_item(domain)
    if not domain_item:
        raise HTTPException(status_code=404, detail="Domain not found")
    if domain_item.get("project_id") != project_id:
        raise HTTPException(status_code=403, detail="Domain belongs to another project")

    # Delete CloudFront distribution tenant
    tenant_id = domain_item.get("tenant_id")
    if tenant_id:
        delete_domain_tenant(tenant_id)

    # Delete DynamoDB item
    delete_domain_item(domain)

    return {
        "domain": domain,
        "deleted": True,
        "message": "Domain removed successfully.",
    }
