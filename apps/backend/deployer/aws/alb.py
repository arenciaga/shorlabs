"""
Application Load Balancer Operations

Manages the shared ALB, per-service target groups, and host-based listener rules.
"""

import os

from ..clients import get_elbv2_client, get_ec2_client
from ..config import ALB_NAME, ALB_SECURITY_GROUP_NAME, FARGATE_CONTAINER_PORT


def ensure_alb_security_group(vpc_id: str) -> str:
    """
    Get or create the ALB security group.

    Allows inbound on ports 80 and 443 from anywhere, all outbound.

    Returns:
        Security group ID
    """
    ec2 = get_ec2_client()

    # Check if SG already exists
    try:
        response = ec2.describe_security_groups(
            Filters=[
                {"Name": "group-name", "Values": [ALB_SECURITY_GROUP_NAME]},
                {"Name": "vpc-id", "Values": [vpc_id]},
            ]
        )
        groups = response.get("SecurityGroups", [])
        if groups:
            return groups[0]["GroupId"]
    except Exception:
        pass

    print(f"🔐 Creating ALB security group: {ALB_SECURITY_GROUP_NAME}")
    response = ec2.create_security_group(
        GroupName=ALB_SECURITY_GROUP_NAME,
        Description="Shorlabs - Application Load Balancer",
        VpcId=vpc_id,
        TagSpecifications=[
            {
                "ResourceType": "security-group",
                "Tags": [
                    {"Key": "Name", "Value": ALB_SECURITY_GROUP_NAME},
                    {"Key": "managed-by", "Value": "shorlabs"},
                ],
            }
        ],
    )
    sg_id = response["GroupId"]

    # Allow inbound HTTP and HTTPS from anywhere
    ec2.authorize_security_group_ingress(
        GroupId=sg_id,
        IpPermissions=[
            {
                "IpProtocol": "tcp",
                "FromPort": 80,
                "ToPort": 80,
                "IpRanges": [{"CidrIp": "0.0.0.0/0"}],
            },
            {
                "IpProtocol": "tcp",
                "FromPort": 443,
                "ToPort": 443,
                "IpRanges": [{"CidrIp": "0.0.0.0/0"}],
            },
        ],
    )

    print(f"✅ ALB security group created: {sg_id}")
    return sg_id


def ensure_shared_alb(subnets: list, security_group_id: str) -> dict:
    """
    Ensure the shared ALB exists with HTTP→HTTPS redirect and HTTPS listener.

    Idempotent: reuses existing ALB if present.

    Returns:
        Dict with alb_arn, alb_dns_name, https_listener_arn
    """
    elbv2 = get_elbv2_client()

    # Check if ALB already exists
    try:
        response = elbv2.describe_load_balancers(Names=[ALB_NAME])
        albs = response.get("LoadBalancers", [])
        if albs:
            alb = albs[0]
            alb_arn = alb["LoadBalancerArn"]
            alb_dns = alb["DNSName"]

            # Find the HTTPS listener
            listeners = elbv2.describe_listeners(LoadBalancerArn=alb_arn)
            https_listener_arn = None
            for listener in listeners.get("Listeners", []):
                if listener.get("Port") == 443:
                    https_listener_arn = listener["ListenerArn"]
                    break

            # If no HTTPS listener, check for HTTP listener (port 80)
            if not https_listener_arn:
                for listener in listeners.get("Listeners", []):
                    if listener.get("Port") == 80:
                        https_listener_arn = listener["ListenerArn"]
                        break

            print(f"✅ ALB exists: {ALB_NAME} ({alb_dns})")
            return {
                "alb_arn": alb_arn,
                "alb_dns_name": alb_dns,
                "https_listener_arn": https_listener_arn,
            }
    except elbv2.exceptions.LoadBalancerNotFoundException:
        pass
    except Exception:
        pass

    print(f"🔧 Creating ALB: {ALB_NAME}")
    response = elbv2.create_load_balancer(
        Name=ALB_NAME,
        Subnets=subnets,
        SecurityGroups=[security_group_id],
        Scheme="internet-facing",
        Type="application",
        Tags=[
            {"Key": "Name", "Value": ALB_NAME},
            {"Key": "managed-by", "Value": "shorlabs"},
        ],
    )
    alb = response["LoadBalancers"][0]
    alb_arn = alb["LoadBalancerArn"]
    alb_dns = alb["DNSName"]

    # Create HTTP listener (port 80) — redirect to HTTPS
    elbv2.create_listener(
        LoadBalancerArn=alb_arn,
        Port=80,
        Protocol="HTTP",
        DefaultActions=[
            {
                "Type": "redirect",
                "RedirectConfig": {
                    "Protocol": "HTTPS",
                    "Port": "443",
                    "StatusCode": "HTTP_301",
                },
            }
        ],
    )

    # Create HTTPS listener (port 443) with ACM cert
    acm_cert_arn = os.environ.get("SHORLABS_WILDCARD_CERT_ARN", "")
    if not acm_cert_arn:
        raise Exception(
            "SHORLABS_WILDCARD_CERT_ARN environment variable is required for HTTPS listener. "
            "Set it to the ARN of your *.shorlabs.com ACM certificate."
        )

    response = elbv2.create_listener(
        LoadBalancerArn=alb_arn,
        Port=443,
        Protocol="HTTPS",
        Certificates=[{"CertificateArn": acm_cert_arn}],
        DefaultActions=[
            {
                "Type": "fixed-response",
                "FixedResponseConfig": {
                    "StatusCode": "404",
                    "ContentType": "text/plain",
                    "MessageBody": "Not Found",
                },
            }
        ],
    )
    https_listener_arn = response["Listeners"][0]["ListenerArn"]

    print(f"✅ ALB created: {ALB_NAME} ({alb_dns})")
    return {
        "alb_arn": alb_arn,
        "alb_dns_name": alb_dns,
        "https_listener_arn": https_listener_arn,
    }


def create_target_group(project_name: str, vpc_id: str, port: int = FARGATE_CONTAINER_PORT) -> str:
    """
    Create an ALB target group for a Fargate service.

    Target type is 'ip' (required for awsvpc network mode).

    Returns:
        Target group ARN
    """
    elbv2 = get_elbv2_client()

    # Target group name has 32 char limit
    tg_name = f"sl-tg-{project_name[:24]}"

    # Check if target group already exists
    try:
        response = elbv2.describe_target_groups(Names=[tg_name])
        tgs = response.get("TargetGroups", [])
        if tgs:
            print(f"✅ Target group exists: {tg_name}")
            return tgs[0]["TargetGroupArn"]
    except elbv2.exceptions.TargetGroupNotFoundException:
        pass
    except Exception:
        pass

    print(f"🎯 Creating target group: {tg_name}")
    response = elbv2.create_target_group(
        Name=tg_name,
        Protocol="HTTP",
        Port=port,
        VpcId=vpc_id,
        TargetType="ip",
        HealthCheckProtocol="HTTP",
        HealthCheckPath="/",
        HealthCheckIntervalSeconds=30,
        HealthCheckTimeoutSeconds=5,
        HealthyThresholdCount=2,
        UnhealthyThresholdCount=3,
        Tags=[
            {"Key": "managed-by", "Value": "shorlabs"},
            {"Key": "project", "Value": project_name},
        ],
    )

    tg_arn = response["TargetGroups"][0]["TargetGroupArn"]
    print(f"✅ Target group created: {tg_name}")
    return tg_arn


def create_listener_rule(
    listener_arn: str,
    target_group_arn: str,
    host_header: str,
) -> str:
    """
    Create or update a host-based listener rule on the HTTPS listener.

    Routes traffic for {subdomain}.shorlabs.com to the target group.
    If a rule for this host_header already exists, updates it to point to the new target group.

    Returns:
        Listener rule ARN
    """
    elbv2 = get_elbv2_client()

    # Check for existing rules with the same host header
    response = elbv2.describe_rules(ListenerArn=listener_arn)
    existing_priorities = []
    existing_rule_for_host = None
    
    for rule in response.get("Rules", []):
        p = rule.get("Priority", "default")
        if p != "default":
            existing_priorities.append(int(p))
            
            # Check if this rule matches our host header
            for condition in rule.get("Conditions", []):
                if condition.get("Field") == "host-header":
                    values = condition.get("HostHeaderConfig", {}).get("Values", [])
                    if host_header in values:
                        existing_rule_for_host = rule
                        break

    # If rule exists for this host, update it instead of creating a new one
    if existing_rule_for_host:
        rule_arn = existing_rule_for_host["RuleArn"]
        print(f"🔄 Updating existing listener rule: {host_header} → target group")
        
        elbv2.modify_rule(
            RuleArn=rule_arn,
            Actions=[
                {
                    "Type": "forward",
                    "TargetGroupArn": target_group_arn,
                }
            ],
        )
        
        print(f"✅ Listener rule updated: {host_header}")
        return rule_arn

    # No existing rule, create a new one
    priority = max(existing_priorities) + 1 if existing_priorities else 1

    print(f"📝 Creating listener rule: {host_header} → target group (priority {priority})")
    response = elbv2.create_rule(
        ListenerArn=listener_arn,
        Conditions=[
            {
                "Field": "host-header",
                "Values": [host_header],
            }
        ],
        Actions=[
            {
                "Type": "forward",
                "TargetGroupArn": target_group_arn,
            }
        ],
        Priority=priority,
    )

    rule_arn = response["Rules"][0]["RuleArn"]
    print(f"✅ Listener rule created: {host_header}")
    return rule_arn


def get_target_group_for_host(listener_arn: str, host_header: str) -> str | None:
    """
    Get the target group ARN for an existing host-based listener rule.

    Returns:
        Target group ARN if found, None otherwise
    """
    elbv2 = get_elbv2_client()

    try:
        response = elbv2.describe_rules(ListenerArn=listener_arn)
        
        for rule in response.get("Rules", []):
            # Check if this rule matches our host header
            for condition in rule.get("Conditions", []):
                if condition.get("Field") == "host-header":
                    values = condition.get("HostHeaderConfig", {}).get("Values", [])
                    if host_header in values:
                        # Get the target group from the action
                        for action in rule.get("Actions", []):
                            if action.get("Type") == "forward":
                                return action.get("TargetGroupArn")
        
        return None
    except Exception as e:
        print(f"⚠️ Failed to get target group for host {host_header}: {e}")
        return None


def delete_listener_rule(rule_arn: str) -> bool:
    """
    Delete an ALB listener rule.

    Returns:
        True if deleted, False if not found
    """
    elbv2 = get_elbv2_client()

    try:
        elbv2.delete_rule(RuleArn=rule_arn)
        print(f"✅ Listener rule deleted: {rule_arn}")
        return True
    except Exception as e:
        print(f"⚠️ Failed to delete listener rule: {e}")
        return False


def delete_target_group(target_group_arn: str) -> bool:
    """
    Delete an ALB target group.

    Returns:
        True if deleted, False if not found
    """
    elbv2 = get_elbv2_client()

    try:
        elbv2.delete_target_group(TargetGroupArn=target_group_arn)
        print(f"✅ Target group deleted: {target_group_arn}")
        return True
    except Exception as e:
        print(f"⚠️ Failed to delete target group: {e}")
        return False


def get_alb_dns_name() -> str:
    """Get the DNS name of the shared ALB."""
    elbv2 = get_elbv2_client()

    try:
        response = elbv2.describe_load_balancers(Names=[ALB_NAME])
        albs = response.get("LoadBalancers", [])
        if albs:
            return albs[0]["DNSName"]
    except Exception:
        pass

    raise Exception(f"ALB {ALB_NAME} not found")
