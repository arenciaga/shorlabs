#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Shorlabs Backend - Lambda Deployment${NC}"
echo -e "${GREEN}Single Lambda + SQS Architecture${NC}"
echo -e "${GREEN}========================================${NC}\n"

# Configuration
AWS_REGION="us-east-1"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPOSITORY_NAME="shorlabs-backend"
LAMBDA_FUNCTION_NAME="shorlabs-api"
DEPLOY_QUEUE_NAME="shorlabs-deploy-queue.fifo"
DLQ_NAME="shorlabs-deploy-dlq.fifo"

# Step 1: Create/verify ECR repository
echo -e "${YELLOW}Step 1: Setting up ECR repository...${NC}"
aws ecr describe-repositories --repository-names $ECR_REPOSITORY_NAME --region $AWS_REGION 2>/dev/null || \
aws ecr create-repository \
    --repository-name $ECR_REPOSITORY_NAME \
    --region $AWS_REGION \
    --image-scanning-configuration scanOnPush=true
echo -e "${GREEN}✓ ECR repository ready${NC}\n"

# Step 2: Build Docker image for linux/amd64
echo -e "${YELLOW}Step 2: Building Docker image (linux/amd64)...${NC}"
docker build --platform linux/amd64 --provenance=false -t $ECR_REPOSITORY_NAME:latest .
echo -e "${GREEN}✓ Docker image built${NC}\n"

# Step 3: Login to ECR and push image
echo -e "${YELLOW}Step 3: Pushing image to ECR...${NC}"
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
docker tag $ECR_REPOSITORY_NAME:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY_NAME:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY_NAME:latest
IMAGE_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY_NAME:latest"
echo -e "${GREEN}✓ Image pushed: $IMAGE_URI${NC}\n"

# Step 4: Create CloudWatch log group
echo -e "${YELLOW}Step 4: Creating CloudWatch log group...${NC}"
aws logs create-log-group --log-group-name /aws/lambda/$LAMBDA_FUNCTION_NAME --region $AWS_REGION 2>/dev/null || echo "Log group already exists"
echo -e "${GREEN}✓ CloudWatch log group ready${NC}\n"

# Step 5: Create SQS Dead Letter Queue (DLQ)
echo -e "${YELLOW}Step 5: Setting up SQS Dead Letter Queue...${NC}"
DLQ_ARN=$(aws sqs get-queue-attributes \
    --queue-url "https://sqs.$AWS_REGION.amazonaws.com/$AWS_ACCOUNT_ID/$DLQ_NAME" \
    --attribute-names QueueArn \
    --query "Attributes.QueueArn" \
    --output text 2>/dev/null) || {
    echo "Creating Dead Letter Queue..."
    DLQ_URL=$(aws sqs create-queue \
        --queue-name $DLQ_NAME \
        --attributes '{
            "FifoQueue": "true",
            "ContentBasedDeduplication": "false",
            "MessageRetentionPeriod": "1209600"
        }' \
        --region $AWS_REGION \
        --query "QueueUrl" --output text)
    DLQ_ARN=$(aws sqs get-queue-attributes \
        --queue-url "$DLQ_URL" \
        --attribute-names QueueArn \
        --query "Attributes.QueueArn" \
        --output text)
}
echo -e "${GREEN}✓ Dead Letter Queue ready: $DLQ_ARN${NC}\n"

# Step 6: Create SQS Deploy Queue
echo -e "${YELLOW}Step 6: Setting up SQS Deploy Queue...${NC}"
DEPLOY_QUEUE_URL=$(aws sqs get-queue-url \
    --queue-name $DEPLOY_QUEUE_NAME \
    --region $AWS_REGION \
    --query "QueueUrl" --output text 2>/dev/null) || {
    echo "Creating Deploy Queue..."
    DEPLOY_QUEUE_URL=$(aws sqs create-queue \
        --queue-name $DEPLOY_QUEUE_NAME \
        --attributes "{
            \"FifoQueue\": \"true\",
            \"ContentBasedDeduplication\": \"false\",
            \"VisibilityTimeout\": \"900\",
            \"MessageRetentionPeriod\": \"86400\",
            \"RedrivePolicy\": \"{\\\"deadLetterTargetArn\\\":\\\"$DLQ_ARN\\\",\\\"maxReceiveCount\\\":3}\"
        }" \
        --region $AWS_REGION \
        --query "QueueUrl" --output text)
}

DEPLOY_QUEUE_ARN=$(aws sqs get-queue-attributes \
    --queue-url "$DEPLOY_QUEUE_URL" \
    --attribute-names QueueArn \
    --query "Attributes.QueueArn" \
    --output text)

echo -e "${GREEN}✓ Deploy Queue ready: $DEPLOY_QUEUE_URL${NC}\n"

# Step 7: Create/update Lambda execution role
echo -e "${YELLOW}Step 7: Setting up IAM role...${NC}"
ROLE_NAME="shorlabs-lambda-role"

# Check if role exists
ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query "Role.Arn" --output text 2>/dev/null) || {
    # Create the role
    aws iam create-role \
        --role-name $ROLE_NAME \
        --assume-role-policy-document '{
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"Service": "lambda.amazonaws.com"},
                "Action": "sts:AssumeRole"
            }]
        }' > /dev/null
    
    ROLE_ARN="arn:aws:iam::$AWS_ACCOUNT_ID:role/$ROLE_NAME"
    
    # Attach policies
    aws iam attach-role-policy --role-name $ROLE_NAME --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
    aws iam attach-role-policy --role-name $ROLE_NAME --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess
    aws iam attach-role-policy --role-name $ROLE_NAME --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess
    aws iam attach-role-policy --role-name $ROLE_NAME --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess
    aws iam attach-role-policy --role-name $ROLE_NAME --policy-arn arn:aws:iam::aws:policy/AWSCodeBuildAdminAccess
    
    echo "Waiting for IAM role to propagate..."
    sleep 10
}

# Add SQS permissions if not already present
aws iam put-role-policy --role-name $ROLE_NAME --policy-name SQSAccess --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
        "Effect": "Allow",
        "Action": [
            "sqs:ReceiveMessage",
            "sqs:DeleteMessage",
            "sqs:GetQueueAttributes",
            "sqs:SendMessage"
        ],
        "Resource": "*"
    }]
}'

# IAM role creation for deployed functions
aws iam put-role-policy --role-name $ROLE_NAME --policy-name IAMForLambda --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
        "Effect": "Allow",
        "Action": ["iam:CreateRole", "iam:GetRole", "iam:AttachRolePolicy", "iam:PassRole", "iam:PutRolePolicy", "iam:DeleteRole", "iam:DetachRolePolicy", "iam:DeleteRolePolicy"],
        "Resource": "*"
    }]
}'

# Lambda management for deploying user functions
aws iam put-role-policy --role-name $ROLE_NAME --policy-name LambdaManagement --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
        "Effect": "Allow",
        "Action": ["lambda:*"],
        "Resource": "*"
    }]
}'

ROLE_ARN="arn:aws:iam::$AWS_ACCOUNT_ID:role/$ROLE_NAME"
echo -e "${GREEN}✓ IAM role ready: $ROLE_ARN${NC}\n"

# Step 8: Create or update Lambda function
echo -e "${YELLOW}Step 8: Deploying Lambda function...${NC}"

# Check if function exists
FUNCTION_EXISTS=$(aws lambda get-function --function-name $LAMBDA_FUNCTION_NAME --region $AWS_REGION 2>/dev/null && echo "yes" || echo "no")

if [ "$FUNCTION_EXISTS" == "no" ]; then
    echo "Creating new Lambda function..."
    aws lambda create-function \
        --function-name $LAMBDA_FUNCTION_NAME \
        --package-type Image \
        --code ImageUri=$IMAGE_URI \
        --role $ROLE_ARN \
        --timeout 900 \
        --memory-size 2048 \
        --region $AWS_REGION \
        --query "FunctionArn" --output text

    echo "Waiting for function to be active..."
    aws lambda wait function-active --function-name $LAMBDA_FUNCTION_NAME --region $AWS_REGION
else
    echo "Updating existing Lambda function..."
    aws lambda update-function-code \
        --function-name $LAMBDA_FUNCTION_NAME \
        --image-uri $IMAGE_URI \
        --region $AWS_REGION \
        --query "FunctionArn" --output text
    
    # Wait for update to complete
    echo "Waiting for function update..."
    aws lambda wait function-updated --function-name $LAMBDA_FUNCTION_NAME --region $AWS_REGION
    
    # Update configuration
    aws lambda update-function-configuration \
        --function-name $LAMBDA_FUNCTION_NAME \
        --timeout 900 \
        --memory-size 2048 \
        --region $AWS_REGION \
        --query "FunctionArn" --output text

    # Wait for config update
    aws lambda wait function-updated --function-name $LAMBDA_FUNCTION_NAME --region $AWS_REGION
fi

echo -e "${GREEN}✓ Lambda function deployed${NC}\n"

# Step 9: Create SQS Event Source Mapping
echo -e "${YELLOW}Step 9: Setting up SQS trigger...${NC}"

# Check if event source mapping already exists
EXISTING_MAPPING=$(aws lambda list-event-source-mappings \
    --function-name $LAMBDA_FUNCTION_NAME \
    --event-source-arn $DEPLOY_QUEUE_ARN \
    --region $AWS_REGION \
    --query "EventSourceMappings[0].UUID" \
    --output text 2>/dev/null)

if [ "$EXISTING_MAPPING" == "None" ] || [ -z "$EXISTING_MAPPING" ]; then
    echo "Creating SQS event source mapping..."
    aws lambda create-event-source-mapping \
        --function-name $LAMBDA_FUNCTION_NAME \
        --event-source-arn $DEPLOY_QUEUE_ARN \
        --batch-size 1 \
        --function-response-types ReportBatchItemFailures \
        --region $AWS_REGION
else
    echo "SQS trigger already exists (UUID: $EXISTING_MAPPING)"
fi

echo -e "${GREEN}✓ SQS trigger configured${NC}\n"

# Step 10: Create/update Function URL
echo -e "${YELLOW}Step 10: Setting up Function URL (HTTPS)...${NC}"

# Check if function URL exists
FUNCTION_URL=$(aws lambda get-function-url-config --function-name $LAMBDA_FUNCTION_NAME --region $AWS_REGION --query "FunctionUrl" --output text 2>/dev/null) || {
    # Create function URL
    aws lambda add-permission \
        --function-name $LAMBDA_FUNCTION_NAME \
        --statement-id FunctionURLPublicAccess \
        --action lambda:InvokeFunctionUrl \
        --principal "*" \
        --function-url-auth-type NONE \
        --region $AWS_REGION 2>/dev/null || true
    
    FUNCTION_URL=$(aws lambda create-function-url-config \
        --function-name $LAMBDA_FUNCTION_NAME \
        --auth-type NONE \
        --cors '{"AllowOrigins":["*"],"AllowMethods":["*"],"AllowHeaders":["*"],"AllowCredentials":true}' \
        --region $AWS_REGION \
        --query "FunctionUrl" --output text)
}

echo -e "${GREEN}✓ Function URL configured${NC}\n"

# Get the final URL
FUNCTION_URL=$(aws lambda get-function-url-config --function-name $LAMBDA_FUNCTION_NAME --region $AWS_REGION --query "FunctionUrl" --output text)

# Success message
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}\n"
echo -e "${BLUE}Architecture: Single Lambda + SQS${NC}\n"
echo -e "${YELLOW}Your API is available at:${NC}"
echo -e "${GREEN}${FUNCTION_URL}${NC}\n"
echo -e "${YELLOW}Endpoints:${NC}"
echo -e "  Health: ${GREEN}${FUNCTION_URL}health${NC}"
echo -e "  API:    ${GREEN}${FUNCTION_URL}api/projects${NC}\n"
echo -e "${YELLOW}Background Tasks:${NC}"
echo -e "  Deploy Queue: ${GREEN}$DEPLOY_QUEUE_URL${NC}"
echo -e "  Dead Letter:  ${GREEN}$DLQ_NAME${NC}"
echo -e "  Max Retries:  ${GREEN}3${NC}\n"
echo -e "${YELLOW}View logs:${NC}"
echo -e "  aws logs tail /aws/lambda/$LAMBDA_FUNCTION_NAME --follow --region $AWS_REGION\n"
echo -e "${YELLOW}Configuration:${NC}"
echo -e "  Memory:  2048 MB"
echo -e "  Timeout: 15 minutes (900s)"
echo -e "  Runtime: Container (Lambda Web Adapter)\n"
