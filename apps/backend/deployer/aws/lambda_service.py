"""
Lambda Operations

Lambda function management.
"""

from ..clients import get_lambda_client
from ..config import (
    LAMBDA_FUNCTION_PREFIX,
    DEFAULT_MEMORY,
    DEFAULT_TIMEOUT,
    DEFAULT_EPHEMERAL_STORAGE,
    RESERVED_ENV_PREFIXES,
    RESERVED_ENV_VARS,
)


def get_lambda_function_name(project_name: str) -> str:
    """
    Get the Lambda function name for a project.
    
    Args:
        project_name: The project name
        
    Returns:
        The Lambda function name
    """
    return f"{LAMBDA_FUNCTION_PREFIX}-{project_name}"


def filter_env_vars(env_vars: dict) -> tuple[dict, list]:
    """
    Filter out reserved environment variables.
    
    Args:
        env_vars: Dictionary of environment variables
        
    Returns:
        Tuple of (filtered_vars, skipped_vars)
    """
    if not env_vars:
        return {}, []
    
    filtered = {}
    skipped = []
    
    for key, value in env_vars.items():
        if key.upper().startswith(RESERVED_ENV_PREFIXES) or key.upper() in RESERVED_ENV_VARS:
            skipped.append(key)
        else:
            filtered[key] = value
    
    return filtered, skipped


def create_or_update_lambda(
    function_name: str,
    image_uri: str,
    role_arn: str,
    env_vars: dict = None,
    memory: int = None,
    timeout: int = None,
    ephemeral_storage: int = None,
) -> str:
    """
    Create or update Lambda function.
    
    Args:
        function_name: Name of the function (without prefix)
        image_uri: ECR image URI
        role_arn: Lambda execution role ARN
        env_vars: Environment variables
        memory: Memory in MB (default: DEFAULT_MEMORY)
        timeout: Timeout in seconds (default: DEFAULT_TIMEOUT)
        ephemeral_storage: Ephemeral storage in MB (default: DEFAULT_EPHEMERAL_STORAGE)
        
    Returns:
        The function URL
    """
    full_name = get_lambda_function_name(function_name)
    memory = memory or DEFAULT_MEMORY
    timeout = timeout or DEFAULT_TIMEOUT
    ephemeral_storage = ephemeral_storage or DEFAULT_EPHEMERAL_STORAGE
    
    # Filter reserved environment variables
    filtered_env_vars, skipped_vars = filter_env_vars(env_vars or {})
    if skipped_vars:
        print(f"⚠️ Skipping reserved env vars: {', '.join(skipped_vars)}")
    
    # Prepare environment config
    environment = {"Variables": filtered_env_vars} if filtered_env_vars else None
    
    lambda_client = get_lambda_client()
    
    try:
        lambda_client.get_function(FunctionName=full_name)
        print(f"🔄 Updating Lambda function: {full_name}")
        lambda_client.update_function_code(
            FunctionName=full_name,
            ImageUri=image_uri,
        )
        
        # Wait for code update to complete
        print("⏳ Waiting for code update...")
        waiter = lambda_client.get_waiter("function_updated")
        waiter.wait(FunctionName=full_name)
        
        # Update function configuration (memory, timeout, ephemeral storage, env vars)
        print("🔧 Updating function configuration...")
        update_config = {
            "FunctionName": full_name,
            "MemorySize": memory,
            "Timeout": timeout,
            "EphemeralStorage": {"Size": ephemeral_storage},
        }
        if environment:
            update_config["Environment"] = environment
        
        lambda_client.update_function_configuration(**update_config)
    except lambda_client.exceptions.ResourceNotFoundException:
        print(f"🚀 Creating Lambda function: {full_name}")
        create_params = {
            "FunctionName": full_name,
            "Role": role_arn,
            "Code": {"ImageUri": image_uri},
            "PackageType": "Image",
            "Timeout": timeout,
            "MemorySize": memory,
            "EphemeralStorage": {"Size": ephemeral_storage},
        }
        if environment:
            create_params["Environment"] = environment
        
        lambda_client.create_function(**create_params)
        
        print("⏳ Waiting for function to be active...")
        waiter = lambda_client.get_waiter("function_active")
        waiter.wait(FunctionName=full_name)
    
    # Get or create function URL
    return _ensure_function_url(full_name)


def _ensure_function_url(function_name: str) -> str:
    """
    Ensure function URL exists and return it.
    
    Args:
        function_name: The full Lambda function name
        
    Returns:
        The function URL
    """
    lambda_client = get_lambda_client()
    
    try:
        response = lambda_client.get_function_url_config(FunctionName=function_name)
        # Ensure streaming mode is enabled (fixes media/binary serving)
        if response.get("InvokeMode") != "RESPONSE_STREAM":
            lambda_client.update_function_url_config(
                FunctionName=function_name,
                AuthType="NONE",
                InvokeMode="RESPONSE_STREAM",
            )
            print("🔄 Updated function URL to RESPONSE_STREAM mode")
        return response["FunctionUrl"]
    except lambda_client.exceptions.ResourceNotFoundException:
        print("🔗 Creating function URL...")
        
        try:
            lambda_client.add_permission(
                FunctionName=function_name,
                StatementId="FunctionURLAllowPublicAccess",
                Action="lambda:InvokeFunctionUrl",
                Principal="*",
                FunctionUrlAuthType="NONE",
            )
        except lambda_client.exceptions.ResourceConflictException:
            pass
        
        response = lambda_client.create_function_url_config(
            FunctionName=function_name,
            AuthType="NONE",
            InvokeMode="RESPONSE_STREAM",
        )
        return response["FunctionUrl"]


def delete_lambda(function_name: str) -> bool:
    """
    Delete a Lambda function and its URL config.
    
    Args:
        function_name: Name of the function (without prefix)
        
    Returns:
        True if deleted, False if not found
    """
    full_name = get_lambda_function_name(function_name)
    lambda_client = get_lambda_client()
    
    try:
        # First remove function URL config if exists
        try:
            lambda_client.delete_function_url_config(FunctionName=full_name)
        except lambda_client.exceptions.ResourceNotFoundException:
            pass
        
        # Delete the function
        lambda_client.delete_function(FunctionName=full_name)
        print(f"✅ Deleted Lambda function: {full_name}")
        return True
    except lambda_client.exceptions.ResourceNotFoundException:
        print(f"⚠️ Lambda function not found: {full_name}")
        return False
    except Exception as e:
        print(f"❌ Failed to delete Lambda: {e}")
        return False
