#!/bin/bash
#
# Setup EventBridge Scheduler for Lambda warming
# Runs every 5 minutes to keep all LIVE user Lambdas warm
#
# Uses the modern EventBridge Scheduler API (not legacy CloudWatch Events rules)
#

set -e

# Load environment variables from .env file
if [ -f .env ]; then
    set -a
    source .env
    set +a
    echo "✅ Loaded AWS credentials from .env"
else
    echo "❌ .env file not found!"
    exit 1
fi

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
FUNCTION_NAME="shorlabs-api"
SCHEDULE_NAME="shorlabs-lambda-warming"
SCHEDULER_ROLE_NAME="shorlabs-scheduler-role"

echo "🔧 Setting up EventBridge Scheduler for Lambda warming..."
echo "   Region: $REGION"
echo "   Function: $FUNCTION_NAME"

# Get Lambda function ARN
FUNCTION_ARN=$(aws lambda get-function \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --query 'Configuration.FunctionArn' \
  --output text)

echo "✅ Found Lambda: $FUNCTION_ARN"

# Step 1: Create/verify scheduler IAM role
echo "🔐 Setting up Scheduler IAM role..."
SCHEDULER_ROLE_ARN=$(aws iam get-role \
  --role-name "$SCHEDULER_ROLE_NAME" \
  --query "Role.Arn" \
  --output text 2>/dev/null) || {

    echo "   Creating role: $SCHEDULER_ROLE_NAME"
    aws iam create-role \
      --role-name "$SCHEDULER_ROLE_NAME" \
      --assume-role-policy-document '{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Principal": {
              "Service": "scheduler.amazonaws.com"
            },
            "Action": "sts:AssumeRole",
            "Condition": {
              "StringEquals": {
                "aws:SourceAccount": "'"$AWS_ACCOUNT_ID"'"
              }
            }
          }
        ]
      }' > /dev/null

    # Allow this role to invoke the shorlabs-api Lambda
    aws iam put-role-policy \
      --role-name "$SCHEDULER_ROLE_NAME" \
      --policy-name "InvokeShorlabsAPI" \
      --policy-document '{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Action": "lambda:InvokeFunction",
            "Resource": "'"$FUNCTION_ARN"'"
          }
        ]
      }'

    echo "   Waiting for IAM role to propagate..."
    sleep 10

    SCHEDULER_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${SCHEDULER_ROLE_NAME}"
}

echo "✅ Scheduler role ready: $SCHEDULER_ROLE_ARN"

# Step 2: Create or update the EventBridge Schedule
echo "📅 Creating EventBridge Schedule..."
aws scheduler create-schedule \
  --name "$SCHEDULE_NAME" \
  --schedule-expression "rate(5 minutes)" \
  --flexible-time-window '{"Mode":"OFF"}' \
  --target '{
    "Arn": "'"$FUNCTION_ARN"'",
    "RoleArn": "'"$SCHEDULER_ROLE_ARN"'",
    "Input": "{\"source\":\"aws.events\",\"detail\":{\"action\":\"warm_lambdas\"}}"
  }' \
  --state ENABLED \
  --region "$REGION" \
  2>/dev/null && echo "✅ Schedule created: $SCHEDULE_NAME" || {
    echo "   Schedule already exists, updating..."
    aws scheduler update-schedule \
      --name "$SCHEDULE_NAME" \
      --schedule-expression "rate(5 minutes)" \
      --flexible-time-window '{"Mode":"OFF"}' \
      --target '{
        "Arn": "'"$FUNCTION_ARN"'",
        "RoleArn": "'"$SCHEDULER_ROLE_ARN"'",
        "Input": "{\"source\":\"aws.events\",\"detail\":{\"action\":\"warm_lambdas\"}}"
      }' \
      --state ENABLED \
      --region "$REGION"
    echo "✅ Schedule updated: $SCHEDULE_NAME"
  }

echo ""
echo "✅ EventBridge Scheduler configured successfully!"
echo ""
echo "   Schedule: Every 5 minutes"
echo "   Action:   warm_lambdas"
echo "   Target:   $FUNCTION_NAME"
echo ""
echo "To manually trigger warming:"
echo "  aws lambda invoke --function-name $FUNCTION_NAME \\"
echo "    --payload '{\"source\":\"aws.events\",\"detail\":{\"action\":\"warm_lambdas\"}}' \\"
echo "    --cli-binary-format raw-in-base64-out \\"
echo "    response.json"
