/**
 * Shorlabs API client for frontend
 * 
 * Note: This module should be used with useAuth() from Clerk.
 * The getToken function should be passed in from the component.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─────────────────────────────────────────────────────────────
// GITHUB API
// ─────────────────────────────────────────────────────────────

export interface GitHubRepo {
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    clone_url: string;
    private: boolean;
    default_branch: string;
    updated_at: string;
    language: string | null;
}

export async function fetchGitHubRepos(token: string): Promise<GitHubRepo[]> {
    const response = await fetch(`${API_BASE_URL}/api/github/repos`, {
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
}

export async function checkGitHubConnection(token: string, orgId: string): Promise<{ connected: boolean }> {
    const url = new URL(`${API_BASE_URL}/api/github/status`);
    url.searchParams.append("org_id", orgId);

    const response = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
}

// ─────────────────────────────────────────────────────────────
// PROJECTS API
// ─────────────────────────────────────────────────────────────

export interface Project {
    project_id: string;
    name: string;
    project_type: "web-app" | "database";
    status: "PENDING" | "CLONING" | "PREPARING" | "UPLOADING" | "BUILDING" | "DEPLOYING" | "PROVISIONING" | "LIVE" | "FAILED";
    created_at: string;
    updated_at: string;
    // Web-app fields
    github_url?: string;
    github_repo?: string;
    function_url?: string | null;
    // Database fields
    db_endpoint?: string | null;
    db_port?: number | null;
    db_name?: string | null;
    db_master_username?: string | null;
    db_cluster_identifier?: string | null;
    min_acu?: number | null;
    max_acu?: number | null;
}

export interface Deployment {
    deploy_id: string;
    build_id: string;
    status: "IN_PROGRESS" | "SUCCEEDED" | "FAILED";
    started_at: string;
    finished_at: string | null;
    commit_sha: string | null;
    commit_message: string | null;
    commit_author_name: string | null;
    commit_author_username: string | null;
    branch: string | null;
}

export interface ProjectDetails {
    project: Project & { ecr_repo: string | null };
    deployments: Deployment[];
}

export interface CreateProjectRequest {
    name: string;
    github_repo: string;
    root_directory?: string;
    env_vars?: Record<string, string>;
    start_command: string;
}

export interface CreateProjectResponse {
    project_id: string;
    name: string;
    github_url: string;
    status: string;
}

export async function fetchProjects(token: string, orgId: string): Promise<Project[]> {
    const url = new URL(`${API_BASE_URL}/api/projects`);
    url.searchParams.append("org_id", orgId);

    const response = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
}

export async function fetchProject(token: string, projectId: string, orgId: string): Promise<ProjectDetails> {
    const url = new URL(`${API_BASE_URL}/api/projects/${projectId}`);
    url.searchParams.append("org_id", orgId);

    const response = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
}

export async function createProject(token: string, orgId: string, data: CreateProjectRequest): Promise<CreateProjectResponse> {
    const url = new URL(`${API_BASE_URL}/api/projects`);
    url.searchParams.append("org_id", orgId);

    const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
}

export async function getProjectStatus(token: string, projectId: string, orgId: string): Promise<{ project_id: string; status: string; function_url: string | null }> {
    const url = new URL(`${API_BASE_URL}/api/projects/${projectId}/status`);
    url.searchParams.append("org_id", orgId);

    const response = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
}

export async function deleteProject(token: string, projectId: string, orgId: string): Promise<{ deleted: boolean }> {
    const url = new URL(`${API_BASE_URL}/api/projects/${projectId}`);
    url.searchParams.append("org_id", orgId);

    const response = await fetch(url.toString(), {
        method: "DELETE",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
}

// ─────────────────────────────────────────────────────────────
// DATABASE API
// ─────────────────────────────────────────────────────────────

export interface CreateDatabaseProjectRequest {
    name: string;
    organization_id: string;
    db_name?: string;
    min_acu?: number;
    max_acu?: number;
}

export interface DatabaseConnection {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    connection_string: string;
}

export async function createDatabaseProject(
    token: string,
    orgId: string,
    data: { name: string; db_name?: string; min_acu?: number; max_acu?: number },
): Promise<{ project_id: string; name: string; project_type: string; status: string }> {
    const url = new URL(`${API_BASE_URL}/api/projects/database`);
    url.searchParams.append("org_id", orgId);

    const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...data, organization_id: orgId }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
}

export async function fetchDatabaseConnection(
    token: string,
    projectId: string,
    orgId: string,
): Promise<DatabaseConnection> {
    const url = new URL(`${API_BASE_URL}/api/projects/${projectId}/connection`);
    url.searchParams.append("org_id", orgId);

    const response = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
}

// ─────────────────────────────────────────────────────────────
// DATABASE EXPLORER
// ─────────────────────────────────────────────────────────────

export interface SchemaInfo {
    schema_name: string;
}

export interface TableInfo {
    table_name: string;
    table_type: string;
    estimated_row_count: number;
}

export interface ColumnInfo {
    column_name: string;
    data_type: string;
    character_maximum_length: number | null;
    is_nullable: string;
    column_default: string | null;
    ordinal_position: number;
    is_primary_key: boolean;
}

export interface TableData {
    columns: string[];
    rows: Record<string, unknown>[];
    page: number;
    page_size: number;
    total_count: number;
    total_pages: number;
}

export async function fetchDatabaseSchemas(
    token: string,
    projectId: string,
    orgId: string,
): Promise<{ schemas: SchemaInfo[] }> {
    const url = new URL(`${API_BASE_URL}/api/projects/${projectId}/database/schemas`);
    url.searchParams.append("org_id", orgId);

    const response = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
}

export async function fetchDatabaseTables(
    token: string,
    projectId: string,
    orgId: string,
    schema: string = "public",
): Promise<{ tables: TableInfo[]; schema: string }> {
    const url = new URL(`${API_BASE_URL}/api/projects/${projectId}/database/tables`);
    url.searchParams.append("org_id", orgId);
    url.searchParams.append("schema", schema);

    const response = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
}

export async function fetchTableColumns(
    token: string,
    projectId: string,
    orgId: string,
    tableName: string,
    schema: string = "public",
): Promise<{ columns: ColumnInfo[]; schema: string; table_name: string }> {
    const url = new URL(`${API_BASE_URL}/api/projects/${projectId}/database/tables/${tableName}/columns`);
    url.searchParams.append("org_id", orgId);
    url.searchParams.append("schema", schema);

    const response = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
}

export async function fetchTableData(
    token: string,
    projectId: string,
    orgId: string,
    tableName: string,
    schema: string = "public",
    page: number = 1,
    pageSize: number = 50,
): Promise<TableData> {
    const url = new URL(`${API_BASE_URL}/api/projects/${projectId}/database/tables/${tableName}/data`);
    url.searchParams.append("org_id", orgId);
    url.searchParams.append("schema", schema);
    url.searchParams.append("page", String(page));
    url.searchParams.append("page_size", String(pageSize));

    const response = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
}

// ─────────────────────────────────────────────────────────────
// DATABASE SECURITY RULES
// ─────────────────────────────────────────────────────────────

export interface SecurityRule {
    rule_id: string;
    protocol: string;
    from_port: number | null;
    to_port: number | null;
    cidr_ipv4: string | null;
    cidr_ipv6: string | null;
    description: string | null;
}

export interface SecurityRulesResponse {
    security_group_id: string;
    inbound: SecurityRule[];
    outbound: SecurityRule[];
}

export async function fetchSecurityRules(
    token: string,
    projectId: string,
    orgId: string,
): Promise<SecurityRulesResponse> {
    const url = new URL(`${API_BASE_URL}/api/projects/${projectId}/database/security-rules`);
    url.searchParams.append("org_id", orgId);

    const response = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
}

export async function addSecurityRule(
    token: string,
    projectId: string,
    orgId: string,
    rule: {
        direction: "inbound" | "outbound";
        protocol: string;
        from_port?: number;
        to_port?: number;
        cidr: string;
        description?: string;
    },
): Promise<{ status: string }> {
    const url = new URL(`${API_BASE_URL}/api/projects/${projectId}/database/security-rules`);
    url.searchParams.append("org_id", orgId);

    const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(rule),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
}

export async function deleteSecurityRule(
    token: string,
    projectId: string,
    orgId: string,
    ruleId: string,
    direction: "inbound" | "outbound",
): Promise<{ status: string }> {
    const url = new URL(`${API_BASE_URL}/api/projects/${projectId}/database/security-rules/${ruleId}`);
    url.searchParams.append("org_id", orgId);
    url.searchParams.append("direction", direction);

    const response = await fetch(url.toString(), {
        method: "DELETE",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
}
