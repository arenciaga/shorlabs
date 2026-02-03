#!/bin/bash
# ============================================================================
# Shorlabs Wildcard Subdomain Setup Script
#
# This script sets up the CloudFront + Lambda@Edge infrastructure for
# automatic subdomain routing (*.shorlabs.com -> user's Lambda).
#
# Prerequisites:
#   - AWS CLI configured with appropriate permissions
#   - ACM certificate for *.shorlabs.com in us-east-1 (already exists)
#   - Route 53 hosted zone for shorlabs.com
#
# Usage:
#   chmod +x setup_wildcard_routing.sh
#   ./setup_wildcard_routing.sh
# ============================================================================

# Read environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo -e "${GREEN}✓ Loaded environment variables from .env${NC}\n"
else
    echo -e "${YELLOW}Note: .env file not found, using shell environment variables${NC}"
fi

# Configuration
REGION="us-east-1"
ROUTER_FUNCTION_NAME="shorlabs-router"
CLOUDFRONT_COMMENT="Shorlabs Wildcard Subdomain Router"
ACM_CERT_ARN=""
DOMAIN="shorlabs.com"
WILDCARD_DOMAIN="*.shorlabs.com"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Shorlabs Wildcard Subdomain Setup${NC}"
echo "============================================"

# ============================================================================
# Step 1: Create IAM Role for Lambda@Edge
# ============================================================================
echo -e "\n${YELLOW}Step 1: Creating IAM role for Lambda@Edge...${NC}"

TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": [
          "lambda.amazonaws.com",
          "edgelambda.amazonaws.com"
        ]
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
)

ROLE_NAME="shorlabs-lambda-edge-role"

# Check if role exists
if aws iam get-role --role-name $ROLE_NAME 2>/dev/null; then
    echo -e "${GREEN}✓ Role already exists${NC}"
    ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text)
else
    echo "Creating IAM role..."
    ROLE_ARN=$(aws iam create-role \
        --role-name $ROLE_NAME \
        --assume-role-policy-document "$TRUST_POLICY" \
        --query 'Role.Arn' \
        --output text)
    
    # Attach basic execution policy
    aws iam attach-role-policy \
        --role-name $ROLE_NAME \
        --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
    
    # Attach DynamoDB read access for subdomain lookups
    aws iam attach-role-policy \
        --role-name $ROLE_NAME \
        --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess
    
    echo -e "${GREEN}✓ Created role: $ROLE_ARN${NC}"
    
    # Wait for role propagation
    echo "Waiting for role to propagate..."
    sleep 10
fi

# ============================================================================
# Step 2: Create/Update Lambda@Edge Function
# ============================================================================
echo -e "\n${YELLOW}Step 2: Creating Lambda@Edge router function...${NC}"

# Create deployment package
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR=$(mktemp -d)

# Copy router lambda and install boto3 for the package
cp "$SCRIPT_DIR/router/router_lambda.py" "$PACKAGE_DIR/lambda_function.py"

# Lambda@Edge requires boto3 bundled (it's included in standard Lambda but not Edge)
pip install boto3 -t "$PACKAGE_DIR" --quiet

cd "$PACKAGE_DIR"
zip -r -q function.zip . -x "*.pyc" -x "__pycache__/*"

# Check if function exists
if aws lambda get-function --function-name $ROUTER_FUNCTION_NAME --region $REGION 2>/dev/null; then
    echo "Updating existing function..."
    aws lambda update-function-code \
        --function-name $ROUTER_FUNCTION_NAME \
        --zip-file fileb://function.zip \
        --region $REGION \
        --publish > /dev/null
    
    # Get latest version
    VERSION=$(aws lambda list-versions-by-function \
        --function-name $ROUTER_FUNCTION_NAME \
        --region $REGION \
        --query 'Versions[-1].Version' \
        --output text)
else
    echo "Creating new function..."
    aws lambda create-function \
        --function-name $ROUTER_FUNCTION_NAME \
        --runtime python3.11 \
        --role $ROLE_ARN \
        --handler lambda_function.handler \
        --zip-file fileb://function.zip \
        --region $REGION \
        --timeout 5 \
        --memory-size 128 \
        --publish > /dev/null
    
    VERSION="1"
fi

LAMBDA_ARN="arn:aws:lambda:$REGION:$(aws sts get-caller-identity --query Account --output text):function:$ROUTER_FUNCTION_NAME:$VERSION"
echo -e "${GREEN}✓ Lambda@Edge function ready: $LAMBDA_ARN${NC}"

# Wait for function to be active to avoid "function must be in Active state" error
echo "Waiting 30s for Lambda to stabilize..."
sleep 30

# Cleanup
cd -
rm -rf "$PACKAGE_DIR"

# ============================================================================
# Step 3: Create CloudFront Distribution
# ============================================================================
echo -e "\n${YELLOW}Step 3: Creating CloudFront distribution...${NC}"

# Check if distribution already exists for this domain
EXISTING_DIST=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?contains(Aliases.Items, '$WILDCARD_DOMAIN')].Id" \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_DIST" ] && [ "$EXISTING_DIST" != "None" ]; then
    echo -e "${GREEN}✓ CloudFront distribution already exists: $EXISTING_DIST${NC}"
    CF_DOMAIN=$(aws cloudfront get-distribution --id $EXISTING_DIST \
        --query 'Distribution.DomainName' --output text)

    # Update CloudFront to use the new Lambda version
    echo "Updating CloudFront to use Lambda version $VERSION..."
    ETAG=$(aws cloudfront get-distribution-config --id $EXISTING_DIST --query "ETag" --output text)
    CONFIG=$(aws cloudfront get-distribution-config --id $EXISTING_DIST --query "DistributionConfig" --output json)

    # Replace the Lambda ARN with the new version
    UPDATED_CONFIG=$(echo "$CONFIG" | sed "s|:function:$ROUTER_FUNCTION_NAME:[0-9]*|:function:$ROUTER_FUNCTION_NAME:$VERSION|g")

    aws cloudfront update-distribution \
        --id $EXISTING_DIST \
        --if-match "$ETAG" \
        --distribution-config "$UPDATED_CONFIG" > /dev/null

    echo -e "${GREEN}✓ CloudFront updated to use Lambda version $VERSION${NC}"
else
    echo "Creating CloudFront distribution..."
    
    # Create distribution config
    DIST_CONFIG=$(cat <<EOF
{
  "CallerReference": "shorlabs-wildcard-$(date +%s)",
  "Comment": "$CLOUDFRONT_COMMENT",
  "Enabled": true,
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "default-origin",
        "DomainName": "shorlabs.com",
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "https-only",
          "OriginSslProtocols": {
            "Quantity": 1,
            "Items": ["TLSv1.2"]
          }
        }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "default-origin",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 7,
      "Items": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
      "CachedMethods": {
        "Quantity": 2,
        "Items": ["GET", "HEAD"]
      }
    },
    "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
    "OriginRequestPolicyId": "216adef6-5c7f-47e4-b989-5492eafa07d3",
    "LambdaFunctionAssociations": {
      "Quantity": 1,
      "Items": [
        {
          "LambdaFunctionARN": "$LAMBDA_ARN",
          "EventType": "origin-request",
          "IncludeBody": false
        }
      ]
    },
    "Compress": true
  },
  "Aliases": {
    "Quantity": 1,
    "Items": ["$WILDCARD_DOMAIN"]
  },
  "ViewerCertificate": {
    "ACMCertificateArn": "$ACM_CERT_ARN",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021"
  },
  "PriceClass": "PriceClass_100"
}
EOF
)

    DIST_ID=$(aws cloudfront create-distribution \
        --distribution-config "$DIST_CONFIG" \
        --query 'Distribution.Id' \
        --output text)
    
    CF_DOMAIN=$(aws cloudfront get-distribution --id $DIST_ID \
        --query 'Distribution.DomainName' --output text)
    
    echo -e "${GREEN}✓ Created CloudFront distribution: $DIST_ID${NC}"
fi

echo -e "${GREEN}✓ CloudFront domain: $CF_DOMAIN${NC}"

# ============================================================================
# Step 4: Route 53 Configuration
# ============================================================================
echo -e "\n${YELLOW}Step 4: Route 53 DNS Configuration${NC}"

# Get hosted zone ID
HOSTED_ZONE_ID=$(aws route53 list-hosted-zones-by-name \
    --dns-name $DOMAIN \
    --query "HostedZones[?Name=='$DOMAIN.'].Id" \
    --output text | sed 's|/hostedzone/||')

if [ -z "$HOSTED_ZONE_ID" ]; then
    echo -e "${YELLOW}⚠️  No Route 53 hosted zone found for $DOMAIN${NC}"
    echo "Since your domain is on GoDaddy (or another provider), you need to manually add a DNS record:"
    echo ""
    echo "  Type:  CNAME"
    echo "  Name:  *"
    echo "  Value: $CF_DOMAIN"
    echo ""
    echo "Setup is otherwise complete!"
    
    # Skip the rest of Route 53 setup
else
    echo "Found hosted zone: $HOSTED_ZONE_ID"

    # Create/Update wildcard A record
    CHANGE_BATCH=$(cat <<EOF
    {
      "Changes": [
        {
          "Action": "UPSERT",
          "ResourceRecordSet": {
            "Name": "$WILDCARD_DOMAIN",
            "Type": "A",
            "AliasTarget": {
              "HostedZoneId": "Z2FDTNDATAQYW2",
              "DNSName": "$CF_DOMAIN",
              "EvaluateTargetHealth": false
            }
          }
        }
      ]
    }
EOF
    )

    aws route53 change-resource-record-sets \
        --hosted-zone-id $HOSTED_ZONE_ID \
        --change-batch "$CHANGE_BATCH" > /dev/null

    echo -e "${GREEN}✓ Created wildcard DNS record: $WILDCARD_DOMAIN -> $CF_DOMAIN${NC}"
fi

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "============================================"
echo -e "${GREEN}🎉 Setup Complete!${NC}"
echo "============================================"
echo ""
echo "CloudFront Distribution: $CF_DOMAIN"
echo "Wildcard Domain: $WILDCARD_DOMAIN"
echo "Lambda@Edge ARN: $LAMBDA_ARN"
echo ""
echo "Next steps:"
echo "  1. Wait for CloudFront distribution to deploy (5-15 minutes)"
echo "  2. Wait for DNS propagation (may take up to 48 hours)"
echo "  3. Update your backend to generate subdomains for new projects"
echo ""
echo "Test with: curl -v https://test-project.shorlabs.com"
