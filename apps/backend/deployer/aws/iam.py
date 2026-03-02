"""
IAM Operations

IAM role management for CodeBuild and Lambda.
"""

import json
import time

from ..clients import get_iam_client
from ..config import CODEBUILD_ROLE_NAME, LAMBDA_ROLE_NAME


def get_or_create_codebuild_role() -> str:
    """
    Get or create the CodeBuild service role.
    
    Returns:
        The role ARN
    """
    iam_client = get_iam_client()
    
    try:
        response = iam_client.get_role(RoleName=CODEBUILD_ROLE_NAME)
        return response["Role"]["Arn"]
    except iam_client.exceptions.NoSuchEntityException:
        pass
    
    print(f"🔐 Creating CodeBuild IAM role...")
    
    trust_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {"Service": "codebuild.amazonaws.com"},
                "Action": "sts:AssumeRole"
            }
        ]
    }
    
    response = iam_client.create_role(
        RoleName=CODEBUILD_ROLE_NAME,
        AssumeRolePolicyDocument=json.dumps(trust_policy),
    )
    role_arn = response["Role"]["Arn"]
    
    # Attach policies for CodeBuild
    policies = [
        "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser",
        "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
        "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess",
    ]
    
    for policy in policies:
        iam_client.attach_role_policy(RoleName=CODEBUILD_ROLE_NAME, PolicyArn=policy)
    
    print("⏳ Waiting for IAM role to propagate...")
    time.sleep(10)
    
    return role_arn


def get_or_create_lambda_role() -> str:
    """
    Get or create the Lambda execution role.
    
    Returns:
        The role ARN
    """
    iam_client = get_iam_client()
    
    # All policies needed for Shorlabs platform to deploy other projects
    REQUIRED_POLICIES = [
        "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",  # CloudWatch Logs
        "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess",                   # Project data
        "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess",       # ECR repos
        "arn:aws:iam::aws:policy/AWSLambda_FullAccess",                       # Lambda functions
        "arn:aws:iam::aws:policy/AmazonS3FullAccess",                         # Build artifacts
        "arn:aws:iam::aws:policy/AWSCodeBuildAdminAccess",                    # CodeBuild
        "arn:aws:iam::aws:policy/IAMFullAccess",                              # Create roles
        "arn:aws:iam::aws:policy/AmazonRDSFullAccess",                        # Aurora clusters
        "arn:aws:iam::aws:policy/SecretsManagerReadWrite",                    # DB credentials
        "arn:aws:iam::aws:policy/AmazonVPCFullAccess",                        # Default VPC + security groups
    ]
    
    try:
        response = iam_client.get_role(RoleName=LAMBDA_ROLE_NAME)
        role_arn = response["Role"]["Arn"]
        
        # Ensure all policies are attached (for existing roles)
        print("🔐 Ensuring Lambda role has all required policies...")
        for policy_arn in REQUIRED_POLICIES:
            try:
                iam_client.attach_role_policy(
                    RoleName=LAMBDA_ROLE_NAME,
                    PolicyArn=policy_arn
                )
            except Exception:
                pass  # Already attached or error
        
        return role_arn
    except iam_client.exceptions.NoSuchEntityException:
        pass
    
    print(f"🔐 Creating Lambda IAM role...")
    
    trust_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {"Service": "lambda.amazonaws.com"},
                "Action": "sts:AssumeRole"
            }
        ]
    }
    
    response = iam_client.create_role(
        RoleName=LAMBDA_ROLE_NAME,
        AssumeRolePolicyDocument=json.dumps(trust_policy),
    )
    role_arn = response["Role"]["Arn"]
    
    # Attach all required policies
    for policy_arn in REQUIRED_POLICIES:
        iam_client.attach_role_policy(RoleName=LAMBDA_ROLE_NAME, PolicyArn=policy_arn)
    
    print("⏳ Waiting for IAM role to propagate...")
    time.sleep(10)
    
    return role_arn
