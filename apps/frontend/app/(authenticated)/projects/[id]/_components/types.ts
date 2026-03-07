export interface Project {
    project_id: string
    name: string
    description?: string
    organization_id?: string
    created_at: string
    updated_at: string
    is_throttled?: boolean
}

export interface Service {
    service_id: string
    project_id: string
    name: string
    service_type: "web-app" | "database"
    status: string
    created_at: string
    updated_at: string
    // Web-app fields
    github_url?: string
    github_repo?: string
    function_url?: string | null
    custom_url?: string | null
    subdomain?: string | null
    ecr_repo?: string | null
    env_vars?: Record<string, string>
    start_command?: string
    root_directory?: string
    memory?: number
    timeout?: number
    ephemeral_storage?: number
    is_throttled?: boolean
    // Database fields
    db_cluster_identifier?: string | null
    db_endpoint?: string | null
    db_port?: number | null
    db_name?: string | null
    db_master_username?: string | null
    min_acu?: number | null
    max_acu?: number | null
    // Nested data (populated on detail view)
    deployments?: Deployment[]
    custom_domains?: CustomDomain[]
}

export interface Deployment {
    deploy_id: string
    build_id: string
    status: "IN_PROGRESS" | "SUCCEEDED" | "FAILED"
    started_at: string
    finished_at: string | null
    commit_sha: string | null
    commit_message: string | null
    commit_author_name: string | null
    commit_author_username: string | null
    branch: string | null
}

export interface CustomDomain {
    domain: string
    status: "PENDING_VERIFICATION" | "ACTIVE" | "FAILED"
    is_active: boolean
    tenant_id: string | null
    created_at: string
}

export interface ProjectDetails {
    project: Project
    services: Service[]
}

export type WebAppTab = "deployments" | "domains" | "logs" | "compute" | "settings"
export type DatabaseTab = "configuration" | "explorer" | "security" | "settings"
export type ActiveTab = WebAppTab | DatabaseTab
