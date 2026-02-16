"""
Credit Breakdown Service - Handles usage breakdown calculations for credit systems.

This module provides functionality to:
1. Fetch credit schema from Autumn API (via multiple methods)
2. Calculate per-feature dollar breakdowns from usage data
3. Handle fallback scenarios when credit schema is unavailable
"""
import os
from typing import Dict, List, Optional

import httpx
from fastapi import HTTPException

AUTUMN_BASE_URL = os.environ.get("AUTUMN_BASE_URL", "https://api.useautumn.com/v1").rstrip("/")


def _fetch_autumn_feature(feature_id: str) -> dict:
    """Fetch feature definition from Autumn to get credit_schema."""
    autumn_key = os.environ.get("AUTUMN_API_KEY")
    if not autumn_key:
        return {}
    
    url = f"{AUTUMN_BASE_URL}/features/{feature_id}"
    try:
        resp = httpx.get(
            url,
            headers={"Authorization": f"Bearer {autumn_key}"},
            timeout=15.0,
        )
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        print(f"⚠️ Failed to fetch Autumn feature {feature_id}: {e}")
    
    return {}


def _fetch_credit_schema_via_check(org_id: str, feature_id: str) -> list:
    """Try to get credit_schema via the check API (which includes it in the response)."""
    autumn_key = os.environ.get("AUTUMN_API_KEY")
    if not autumn_key:
        return []
    
    url = f"{AUTUMN_BASE_URL}/check"
    try:
        # Check with a minimal required_balance to get the credit_schema
        resp = httpx.post(
            url,
            headers={"Authorization": f"Bearer {autumn_key}"},
            json={
                "customer_id": org_id,
                "feature_id": feature_id,
                "required_balance": 0,  # Just to get the schema, not actually checking
            },
            timeout=15.0,
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get("credit_schema") or []
    except Exception as e:
        print(f"⚠️ Failed to fetch credit_schema via check API: {e}")
    
    return []


def get_credit_schema(org_id: str, usd_credits: dict, features: dict) -> list:
    """
    Get credit_schema from multiple sources with fallbacks.
    
    Tries in order:
    1. Customer feature object (usd_credits)
    2. Feature definition API
    3. Check API (via metered features)
    
    Args:
        org_id: Organization ID
        usd_credits: The usd_credits feature object from customer API
        features: All features from customer API
        
    Returns:
        List of credit schema entries
    """
    # Try to get credit_schema from customer feature object first
    credit_schema = usd_credits.get("credit_schema") or []
    
    # If not found, try fetching from feature definition
    if not credit_schema:
        feature_def = _fetch_autumn_feature("usd_credits")
        credit_schema = feature_def.get("credit_schema") or []
    
    # If still not found, try using check API (which includes credit_schema in response)
    if not credit_schema:
        # Try checking one of the metered features to get credit_schema
        for test_fid in ["invocations", "compute"]:
            if test_fid in features:
                credit_schema = _fetch_credit_schema_via_check(org_id, test_fid)
                if credit_schema:
                    break
    
    return credit_schema


def calculate_breakdown_with_schema(
    credit_schema: list,
    features: dict,
) -> List[Dict[str, any]]:
    """
    Calculate breakdown using credit_schema.
    
    Args:
        credit_schema: Credit schema from Autumn (list of {feature_id, credit_amount} entries)
        features: All features from customer API
        
    Returns:
        List of breakdown entries with featureId, label, dollarAmount, rawUsage
    """
    breakdown_response = []
    
    for schema_entry in credit_schema:
        # Support both field name formats
        fid = schema_entry.get("feature_id") or schema_entry.get("metered_feature_id") or ""
        credit_amount = float(schema_entry.get("credit_amount") or schema_entry.get("credit_cost") or 0)

        if not fid:
            continue

        feat_data = features.get(fid) or {}
        
        # For credit system features, usage might be in 'balance' or 'usage' field
        # Use the same logic as the usage endpoint (lines 97-109 in usage.py)
        feat_balance = feat_data.get("balance")
        feat_usage = feat_data.get("usage")
        
        # Try balance first (for credit system features), then usage
        if feat_balance is not None:
            raw_usage = float(feat_balance or 0)
        else:
            raw_usage = float(feat_usage or 0)
        
        # Debug: log what we're getting from features
        print(f"🔍 Feature data for {fid}: {feat_data}")
        print(f"🔍 Raw usage for {fid}: balance={feat_balance}, usage={feat_usage}, final={raw_usage}")

        # Calculate dollar amount from credit cost
        # According to Autumn monetary credits docs:
        # - credit_amount is the cost in credits per unit
        # - For monetary credits: 1 credit = 1 cent
        # - So: total_credits = raw_usage * credit_amount (in cents)
        # - Convert to dollars: total_credits / 100
        # 
        # However, based on real-world usage, credit_amount appears to be stored
        # as dollars per unit (not cents). For example:
        # - If credit_amount = 0.0002, that means $0.0002 per invocation
        # - 764 invocations * $0.0002 = $0.1528
        #
        # So we should multiply directly without dividing by 100.
        # The division by 100 only applies when converting from cents to dollars,
        # but credit_amount already represents the dollar cost per unit.
        
        dollar_amount = round(raw_usage * credit_amount, 2)
        
        # Debug logging
        print(f"🔍 Breakdown calc: feature={fid}, usage={raw_usage}, credit_amount={credit_amount}, dollar_amount={dollar_amount}")

        label_map = {
            "invocations": "Requests",
            "compute": "Compute (GB-s)",
            "build_seconds": "Build (s)",
        }

        breakdown_response.append({
            "featureId": fid,
            "label": label_map.get(fid, fid),
            "dollarAmount": dollar_amount,
            "rawUsage": round(raw_usage, 2) if isinstance(raw_usage, float) else int(raw_usage),
        })
    
    return breakdown_response


def calculate_breakdown_fallback(
    features: dict,
    credits_usage: float,
) -> List[Dict[str, any]]:
    """
    Calculate breakdown using proportional estimation when credit_schema is unavailable.
    
    This is a fallback that estimates costs proportionally based on total credit usage.
    Note: This is a rough estimate - actual costs may vary by feature.
    
    Args:
        features: All features from customer API
        credits_usage: Total credit usage in cents
        
    Returns:
        List of breakdown entries with featureId, label, dollarAmount, rawUsage
    """
    breakdown_response = []
    known_features = ["invocations", "compute", "build_seconds"]
    total_raw_usage = 0.0
    feature_usages = {}
    
    for fid in known_features:
        feat_data = features.get(fid) or {}
        raw_usage = float(feat_data.get("usage", 0) or 0)
        if raw_usage > 0:
            feature_usages[fid] = raw_usage
            total_raw_usage += raw_usage
    
    # If we have total credit usage and feature usages, estimate proportional costs
    for fid, raw_usage in feature_usages.items():
        if total_raw_usage > 0 and credits_usage > 0:
            # Estimate: allocate credit usage proportionally based on raw usage
            # This is a rough estimate - actual costs may vary by feature
            estimated_credits = (raw_usage / total_raw_usage) * credits_usage
            dollar_amount = round(estimated_credits / 100, 2)
        else:
            dollar_amount = 0.0
        
        label_map = {
            "invocations": "Requests",
            "compute": "Compute (GB-s)",
            "build_seconds": "Build (s)",
        }
        breakdown_response.append({
            "featureId": fid,
            "label": label_map.get(fid, fid),
            "dollarAmount": dollar_amount,
            "rawUsage": round(raw_usage, 2) if isinstance(raw_usage, float) else int(raw_usage),
        })
    
    return breakdown_response


def calculate_usage_breakdown(
    org_id: str,
    features: dict,
    usd_credits: dict,
) -> Optional[List[Dict[str, any]]]:
    """
    Calculate per-feature usage breakdown for credit system users.
    
    This is the main entry point for calculating breakdowns. It handles:
    - Fetching credit_schema from multiple sources
    - Calculating dollar amounts per feature
    - Fallback to proportional estimation if schema unavailable
    
    Args:
        org_id: Organization ID
        features: All features from customer API
        usd_credits: The usd_credits feature object from customer API
        
    Returns:
        List of breakdown entries, or None if not a credit system user
    """
    credits_included = usd_credits.get("included_usage")
    has_credit_system = credits_included is not None and credits_included > 0
    
    if not has_credit_system:
        return None
    
    credits_usage = float(usd_credits.get("usage", 0) or 0)
    
    # Get credit_schema with multiple fallbacks
    credit_schema = get_credit_schema(org_id, usd_credits, features)
    
    # Debug logging
    print(f"🔍 Credit breakdown: org_id={org_id}, credits_usage={credits_usage}, credit_schema={credit_schema}")
    print(f"🔍 Available features: {list(features.keys())}")
    for fid in ["invocations", "compute", "build_seconds"]:
        if fid in features:
            feat = features[fid]
            print(f"🔍 Feature {fid}: usage={feat.get('usage')}, balance={feat.get('balance')}")
    
    # Calculate breakdown
    if credit_schema:
        breakdown = calculate_breakdown_with_schema(credit_schema, features)
        # Debug: sum up breakdown to verify
        total_breakdown = sum(item.get("dollarAmount", 0) for item in breakdown)
        print(f"🔍 Breakdown total: ${total_breakdown:.2f}, Expected: ${credits_usage/100:.2f}")
        print(f"🔍 Breakdown items: {breakdown}")
        return breakdown
    else:
        # Fallback: estimate proportionally
        print(f"⚠️ No credit_schema found, using fallback calculation")
        return calculate_breakdown_fallback(features, credits_usage)
