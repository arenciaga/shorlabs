#!/bin/bash
# ============================================================================
# Complete CloudFront Multi-Tenant DNS Setup
# 
# This script updates your DNS records to point to the new multi-tenant
# CloudFront distribution.
# ============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration - UPDATE THESE IF DIFFERENT
ROUTING_ENDPOINT="d34dyjn0btmcwo.cloudfront.net"
DISTRIBUTION_ID="E3F7KIH2D9069"
TENANT_ID="dt_39kE4ecjmZKdAO8pmq2RJZbeuLV"
DOMAIN="shorlabs.com"
CERT_ARN="arn:aws:acm:us-east-1:688041016803:certificate/a17e4776-5943-4249-84ed-58a7426e20a3"

echo -e "${GREEN}🚀 Completing CloudFront Multi-Tenant Setup${NC}"
echo "============================================"
echo ""
echo "Configuration:"
echo "  Routing Endpoint: $ROUTING_ENDPOINT"
echo "  Distribution ID:  $DISTRIBUTION_ID"
echo "  Tenant ID:        $TENANT_ID"
echo ""

# ============================================================================
# Step 1: Get Route 53 Hosted Zone
# ============================================================================
echo -e "${YELLOW}Step 1: Finding Route 53 hosted zone...${NC}"

HOSTED_ZONE_ID=$(aws route53 list-hosted-zones-by-name \
  --dns-name $DOMAIN \
  --query "HostedZones[?Name=='$DOMAIN.'].Id" \
  --output text | sed 's|/hostedzone/||')

if [ -z "$HOSTED_ZONE_ID" ]; then
    echo -e "${RED}❌ No Route 53 hosted zone found for $DOMAIN${NC}"
    echo "If your DNS is managed elsewhere (GoDaddy, etc.), manually create these records:"
    echo ""
    echo "  *.shorlabs.com     A (Alias)  → $ROUTING_ENDPOINT"
    echo "  shorlabs.com       A (Alias)  → $ROUTING_ENDPOINT"
    echo "  cname.shorlabs.com CNAME      → $ROUTING_ENDPOINT"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ Found hosted zone: $HOSTED_ZONE_ID${NC}"

# ============================================================================
# Step 2: Update *.shorlabs.com
# ============================================================================
echo -e "\n${YELLOW}Step 2: Updating *.shorlabs.com DNS record...${NC}"

aws route53 change-resource-record-sets \
  --hosted-zone-id "$HOSTED_ZONE_ID" \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "*.shorlabs.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "'"$ROUTING_ENDPOINT"'",
          "EvaluateTargetHealth": false
        }
      }
    }]
  }' > /dev/null

echo -e "${GREEN}✓ Updated *.shorlabs.com → $ROUTING_ENDPOINT${NC}"

# ============================================================================
# Step 3: Update shorlabs.com root domain
# ============================================================================
echo -e "\n${YELLOW}Step 3: Updating shorlabs.com DNS record...${NC}"

aws route53 change-resource-record-sets \
  --hosted-zone-id "$HOSTED_ZONE_ID" \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "shorlabs.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "'"$ROUTING_ENDPOINT"'",
          "EvaluateTargetHealth": false
        }
      }
    }]
  }' > /dev/null

echo -e "${GREEN}✓ Updated shorlabs.com → $ROUTING_ENDPOINT${NC}"

# ============================================================================
# Step 4: Update cname.shorlabs.com for custom domains
# ============================================================================
echo -e "\n${YELLOW}Step 4: Updating cname.shorlabs.com DNS record...${NC}"

aws route53 change-resource-record-sets \
  --hosted-zone-id "$HOSTED_ZONE_ID" \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "cname.shorlabs.com",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{"Value": "'"$ROUTING_ENDPOINT"'"}]
      }
    }]
  }' > /dev/null

echo -e "${GREEN}✓ Updated cname.shorlabs.com → $ROUTING_ENDPOINT${NC}"

# ============================================================================
# Step 5: Update .env file
# ============================================================================
echo -e "\n${YELLOW}Step 5: Updating .env file...${NC}"

# Backup existing .env
if [ -f .env ]; then
    cp .env .env.backup
    echo -e "${GREEN}✓ Backed up existing .env to .env.backup${NC}"
fi

# Add or update environment variables
if [ -f .env ]; then
    # Remove old values if they exist
    sed -i.tmp '/^CLOUDFRONT_MULTITENANT_DISTRIBUTION_ID=/d' .env
    sed -i.tmp '/^CLOUDFRONT_TENANT_ID=/d' .env
    sed -i.tmp '/^CLOUDFRONT_ROUTING_ENDPOINT=/d' .env
    sed -i.tmp '/^SHORLABS_WILDCARD_CERT_ARN=/d' .env
    rm -f .env.tmp
fi

# Append new values
cat >> .env << EOF

# CloudFront Multi-Tenant Configuration
CLOUDFRONT_MULTITENANT_DISTRIBUTION_ID=$DISTRIBUTION_ID
CLOUDFRONT_TENANT_ID=$TENANT_ID
CLOUDFRONT_ROUTING_ENDPOINT=$ROUTING_ENDPOINT
SHORLABS_WILDCARD_CERT_ARN=$CERT_ARN
EOF

echo -e "${GREEN}✓ Updated .env file${NC}"

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "============================================"
echo -e "${GREEN}🎉 DNS Configuration Complete!${NC}"
echo "============================================"
echo ""
echo -e "${BLUE}Environment variables added to .env:${NC}"
echo "  CLOUDFRONT_MULTITENANT_DISTRIBUTION_ID=$DISTRIBUTION_ID"
echo "  CLOUDFRONT_TENANT_ID=$TENANT_ID"
echo "  CLOUDFRONT_ROUTING_ENDPOINT=$ROUTING_ENDPOINT"
echo "  SHORLABS_WILDCARD_CERT_ARN=$CERT_ARN"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Wait 5-10 minutes for DNS propagation"
echo "  2. Test wildcard subdomain:"
echo "     curl -vsk https://test-project.shorlabs.com"
echo ""
echo "  3. Test root domain:"
echo "     curl -vsk https://shorlabs.com"
echo ""
echo "  4. Deploy your updated backend code"
echo ""
echo "  5. Once everything works, disable the old distribution:"
echo "     aws cloudfront get-distribution-config --id E35BYZ1UHNSVDA > old.json"
echo "     # Then manually set Enabled=false and update"
echo ""
echo -e "${GREEN}All done! 🚀${NC}"
echo ""