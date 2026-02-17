"""
Usage API routes - Organization usage metrics and billing information.
"""
import os
import calendar
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from api.auth import get_current_user_id
from api.db.dynamodb import get_throttle_state

router = APIRouter(prefix="/api/projects", tags=["usage"])

AUTUMN_BASE_URL = os.environ.get("AUTUMN_BASE_URL", "https://api.useautumn.com/v1").rstrip("/")


def _fetch_autumn_customer(org_id: str) -> dict:
    """Fetch customer data from Autumn API."""
    autumn_key = os.environ.get("AUTUMN_API_KEY")
    if not autumn_key:
        raise HTTPException(status_code=500, detail="AUTUMN_API_KEY not configured")

    url = f"{AUTUMN_BASE_URL}/customers/{org_id}"
    try:
        resp = httpx.get(
            url,
            headers={"Authorization": f"Bearer {autumn_key}"},
            timeout=15.0,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach Autumn: {e}")

    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=f"Autumn error: {resp.text}")

    data = resp.json()
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="Invalid Autumn response")
    return data


def _extract_billing_period(customer: dict, features: dict) -> tuple[Optional[str], Optional[str]]:
    """Extract billing period start/end from Autumn customer data."""
    period_start = None
    period_end = None

    # Try products first (most reliable source)
    products = customer.get("products") or []
    # Non-default products (actual subscriptions) take priority
    products_sorted = sorted(products, key=lambda p: p.get("is_default", False))

    for product in products_sorted:
        pe = product.get("current_period_end")
        if not pe:
            continue

        status = product.get("status", "")
        period_end = datetime.utcfromtimestamp(pe / 1000).isoformat()

        if status == "trialing":
            started = product.get("started_at")
            if started:
                period_start = datetime.utcfromtimestamp(started / 1000).isoformat()
        else:
            ps = product.get("current_period_start")
            if ps:
                period_start = datetime.utcfromtimestamp(ps / 1000).isoformat()

        if period_start and period_end:
            break

    # Fallback: derive from next_reset_at on features
    if not period_end:
        for feat in features.values():
            if not isinstance(feat, dict):
                continue
            next_reset = feat.get("next_reset_at")
            if not next_reset:
                continue

            reset_dt = datetime.utcfromtimestamp(next_reset / 1000)
            period_end = reset_dt.isoformat()

            if not period_start:
                if reset_dt.month == 1:
                    start_dt = reset_dt.replace(year=reset_dt.year - 1, month=12)
                else:
                    prev_month = reset_dt.month - 1
                    max_day = calendar.monthrange(reset_dt.year, prev_month)[1]
                    start_dt = reset_dt.replace(month=prev_month, day=min(reset_dt.day, max_day))
                period_start = start_dt.isoformat()
            break

    return period_start, period_end


@router.get("/usage")
async def get_org_usage(
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """
    Get organization usage for the current billing period.
    - Pro/Plus (credit system): returns dollar-based credit usage.
    - Hobby (raw features): returns raw invocation/compute counts.
    """
    customer = _fetch_autumn_customer(org_id)
    features = customer.get("features") or {}

    inv = features.get("invocations") or {}
    comp = features.get("compute") or {}
    usd_credits = features.get("usd_credits") or {}

    # ── Credit system (Pro / Plus) ────────────────────────────────
    credits_included = usd_credits.get("included_usage")
    has_credit_system = credits_included is not None and credits_included > 0

    credits_response = None
    if has_credit_system:
        credits_usage = float(usd_credits.get("usage", 0) or 0)
        credits_balance = float(usd_credits.get("balance", 0) or 0)
        credits_included_f = float(credits_included)
        # Autumn stores cents → convert to dollars
        credits_response = {
            "used": round(credits_usage / 100, 2),
            "included": round(credits_included_f / 100, 2),
            "balance": round(credits_balance / 100, 2),
            "currency": "USD",
        }

    # ── Raw counts (Hobby) ────────────────────────────────────────
    if inv.get("included_usage") is not None and inv.get("balance") is not None:
        current_invocations = int(inv["balance"])
        included_invocations = int(inv["included_usage"])
    else:
        current_invocations = int(inv.get("usage", 0) or 0)
        included_invocations = int(inv.get("included_usage", 0) or 0)

    if comp.get("included_usage") is not None and comp.get("balance") is not None:
        current_compute = float(comp["balance"])
        included_compute = float(comp["included_usage"])
    else:
        current_compute = float(comp.get("usage", 0.0) or 0.0)
        included_compute = float(comp.get("included_usage", 0.0) or 0.0)

    # ── Billing period ────────────────────────────────────────────
    period_start, period_end = _extract_billing_period(customer, features)

    # ── Throttle status ───────────────────────────────────────────
    throttle_state = get_throttle_state(org_id)
    is_throttled = bool(throttle_state and throttle_state.get("is_throttled"))

    return {
        "credits": credits_response,
        "requests": {
            "current": current_invocations,
            "limit": included_invocations if not has_credit_system else None,
        },
        "gbSeconds": {
            "current": round(current_compute, 2),
            "limit": included_compute if not has_credit_system else None,
        },
        "periodStart": period_start,
        "periodEnd": period_end,
        "lastUpdated": datetime.utcnow().isoformat(),
        "isThrottled": is_throttled,
        "throttleReason": throttle_state.get("reason") if is_throttled else None,
        "throttledAt": throttle_state.get("throttled_at") if is_throttled else None,
    }

