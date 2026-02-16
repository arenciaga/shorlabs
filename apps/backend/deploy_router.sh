#!/bin/bash
# ============================================================================
# Shorlabs Lambda@Edge Router Deployment Script (FIXED)
#
# This script deploys/updates the Lambda@Edge router function for the
# multi-tenant CloudFront distribution.
#
# FIXES:
#   - Disables AWS CLI v2 pager (prevents hanging)
#   - Handles multi-line values in .env (like private keys)
#   - Removes PriceClass field before updating (not supported for multi-tenant)
#
# Prerequisites:
#   - AWS CLI configured with appropriate permissions
#   - Multi-tenant CloudFront distribution already created
#   - CLOUDFRONT_MULTITENANT_DISTRIBUTION_ID set in .env
#
# Usage:
#   chmod +x deploy_router.sh
#   ./deploy_router.sh
# ============================================================================

# ============================================================================
# CRITICAL: Disable AWS CLI v2 pager to prevent script from hanging
# ============================================================================
export AWS_PAGER=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ============================================================================
# Load .env file (properly handles multi-line values like private keys)
# ============================================================================
if [ -f .env ]; then
    # Only export simple key=value pairs (skip multi-line values)
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        [[ $key =~ ^#.*$ ]] && continue
        [[ -z $key ]] && continue
        # Skip lines that look like they're part of a multi-line value
        [[ $key =~ ^[[:space:]] ]] && continue
        # Export the variable
        export "$key=$value"
    done < <(grep -E '^[A-Z_][A-Z0-9_]*=' .env)
    echo -e "${GREEN}✓ Loaded environment variables from .env${NC}\n"
else
    echo -e "${YELLOW}Note: .env file not found, using shell environment variables${NC}"
fi

# Configuration
REGION="us-east-1"
ROUTER_FUNCTION_NAME="shorlabs-router"
CLOUDFRONT_DISTRIBUTION_ID="${CLOUDFRONT_MULTITENANT_DISTRIBUTION_ID:-}"

echo -e "${GREEN}🚀 Shorlabs Lambda@Edge Router Deployment${NC}"
echo "============================================"

# Validate prerequisites
if [ -z "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
    echo -e "${RED}❌ CLOUDFRONT_MULTITENANT_DISTRIBUTION_ID not set in .env${NC}"
    echo "Add this to your .env file:"
    echo "  CLOUDFRONT_MULTITENANT_DISTRIBUTION_ID=E3F7KIH2D9069"
    exit 1
fi

echo -e "${BLUE}Multi-tenant Distribution: $CLOUDFRONT_DISTRIBUTION_ID${NC}\n"

# ============================================================================
# Step 1: Verify IAM Role
# ============================================================================
echo -e "${YELLOW}Step 1: Verifying IAM role for Lambda@Edge...${NC}"

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

# Check if role exists (suppress verbose output)
if aws iam get-role --role-name $ROLE_NAME --output json > /dev/null 2>&1; then
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
# Step 2: Deploy Lambda@Edge Function
# ============================================================================
echo -e "\n${YELLOW}Step 2: Deploying Lambda@Edge router function...${NC}"

# Create deployment package
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR=$(mktemp -d)

# Check if router lambda exists
if [ ! -f "$SCRIPT_DIR/router/router_lambda.py" ]; then
    echo -e "${RED}❌ router/router_lambda.py not found${NC}"
    echo "Make sure the file exists at: $SCRIPT_DIR/router/router_lambda.py"
    exit 1
fi

# Copy router lambda
cp "$SCRIPT_DIR/router/router_lambda.py" "$PACKAGE_DIR/lambda_function.py"

# Lambda@Edge requires boto3 bundled (it's included in standard Lambda but not Edge)
echo "Installing dependencies..."
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
        --runtime python3.12 \
        --role $ROLE_ARN \
        --handler lambda_function.handler \
        --zip-file fileb://function.zip \
        --region $REGION \
        --timeout 5 \
        --memory-size 128 \
        --publish > /dev/null
    
    VERSION="1"
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
LAMBDA_ARN="arn:aws:lambda:$REGION:$ACCOUNT_ID:function:$ROUTER_FUNCTION_NAME:$VERSION"
echo -e "${GREEN}✓ Lambda@Edge function deployed: version $VERSION${NC}"
echo -e "${GREEN}  ARN: $LAMBDA_ARN${NC}"

# Wait for Lambda function to become Active (required before CloudFront association)
echo "Waiting for Lambda function to become Active..."
MAX_WAIT=60
WAIT_COUNT=0
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    LAMBDA_STATE=$(aws lambda get-function \
        --function-name $ROUTER_FUNCTION_NAME \
        --qualifier $VERSION \
        --region $REGION \
        --query 'Configuration.State' \
        --output text)
    
    if [ "$LAMBDA_STATE" == "Active" ]; then
        echo -e "${GREEN}✓ Lambda function is Active${NC}"
        break
    fi
    
    echo "  State: $LAMBDA_STATE (waiting...)"
    sleep 2
    WAIT_COUNT=$((WAIT_COUNT + 2))
done

if [ "$LAMBDA_STATE" != "Active" ]; then
    echo -e "${RED}❌ Lambda function did not become Active after ${MAX_WAIT}s${NC}"
    echo "Current state: $LAMBDA_STATE"
    exit 1
fi

# Cleanup
cd - > /dev/null
rm -rf "$PACKAGE_DIR"

# ============================================================================
# Step 3: Update Multi-Tenant Distribution
# ============================================================================
echo -e "\n${YELLOW}Step 3: Updating multi-tenant distribution...${NC}"

# Get current distribution config
echo "Fetching distribution config..."
DIST_CONFIG_FILE=$(mktemp)
aws cloudfront get-distribution-config \
    --id $CLOUDFRONT_DISTRIBUTION_ID \
    --output json > "$DIST_CONFIG_FILE"

ETAG=$(cat "$DIST_CONFIG_FILE" | jq -r '.ETag')
CURRENT_CONFIG=$(cat "$DIST_CONFIG_FILE" | jq '.DistributionConfig')

# Check current Lambda version
CURRENT_LAMBDA=$(echo "$CURRENT_CONFIG" | jq -r '.DefaultCacheBehavior.LambdaFunctionAssociations.Items[0].LambdaFunctionARN // ""')

if [ -n "$CURRENT_LAMBDA" ]; then
    CURRENT_VERSION=$(echo "$CURRENT_LAMBDA" | grep -oE '[0-9]+$')
    echo "Current Lambda version: $CURRENT_VERSION"
fi

# ============================================================================
# FIX: Remove PriceClass field (not supported for multi-tenant distributions)
# ============================================================================
echo "Removing PriceClass field (not supported for multi-tenant)..."
UPDATED_CONFIG=$(echo "$CURRENT_CONFIG" | jq 'del(.PriceClass)')

# Update Lambda ARN in config
UPDATED_CONFIG=$(echo "$UPDATED_CONFIG" | jq \
    --arg lambda_arn "$LAMBDA_ARN" \
    '.DefaultCacheBehavior.LambdaFunctionAssociations.Items[0].LambdaFunctionARN = $lambda_arn')

# Save updated config
UPDATED_CONFIG_FILE=$(mktemp)
echo "$UPDATED_CONFIG" > "$UPDATED_CONFIG_FILE"

# Update distribution
echo "Updating distribution to use Lambda version $VERSION..."
UPDATE_OUTPUT=$(aws cloudfront update-distribution \
    --id $CLOUDFRONT_DISTRIBUTION_ID \
    --if-match "$ETAG" \
    --distribution-config file://"$UPDATED_CONFIG_FILE" 2>&1)

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Distribution updated successfully${NC}"
    echo -e "${BLUE}  Distribution: $CLOUDFRONT_DISTRIBUTION_ID${NC}"
    echo -e "${BLUE}  Lambda: $LAMBDA_ARN${NC}"
else
    echo -e "${RED}❌ Failed to update distribution${NC}"
    echo -e "${RED}Error: $UPDATE_OUTPUT${NC}"
    rm -f "$DIST_CONFIG_FILE" "$UPDATED_CONFIG_FILE"
    exit 1
fi

# Cleanup temp files
rm -f "$DIST_CONFIG_FILE" "$UPDATED_CONFIG_FILE"

# ============================================================================
# Step 4: Wait for Deployment
# ============================================================================
echo -e "\n${YELLOW}Step 4: Waiting for deployment...${NC}"
echo "CloudFront is deploying the changes to edge locations..."
echo "This typically takes 5-15 minutes."
echo ""
echo "You can check status with:"
echo "  aws cloudfront get-distribution --id $CLOUDFRONT_DISTRIBUTION_ID --query 'Distribution.Status'"
echo ""

# ============================================================================
# Summary
# ============================================================================
echo "============================================"
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo "============================================"
echo ""
echo -e "${BLUE}Configuration:${NC}"
echo "  Distribution ID: $CLOUDFRONT_DISTRIBUTION_ID"
echo "  Lambda Function: $ROUTER_FUNCTION_NAME"
echo "  Lambda Version:  $VERSION"
echo "  Lambda ARN:      $LAMBDA_ARN"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Wait for CloudFront deployment (5-15 minutes)"
echo "  2. Test wildcard subdomain:"
echo "     curl -vsk https://test-project.shorlabs.com"
echo ""
echo "  3. Test custom domain:"
echo "     curl -vsk https://www.tomorrow-space.com"
echo ""
echo -e "${GREEN}Router updated successfully! 🚀${NC}"
echo ""