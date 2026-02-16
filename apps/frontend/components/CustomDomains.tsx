"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
    Globe,
    Link2,
    Plus,
    Loader2,
    Copy,
    Check,
    XCircle,
    Shield,
    RefreshCw,
    CheckCircle2,
    Trash2,
    ChevronDown,
    ChevronUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useAuth } from "@clerk/nextjs"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export interface CustomDomainRecord {
    domain: string
    status: "PENDING_VERIFICATION" | "PROVISIONING" | "ACTIVE" | "FAILED"
    is_active: boolean
    tenant_id: string | null
    created_at: string
}

interface DomainResponse {
    dns_verified?: boolean
    message?: string
    status?: string
    is_active?: boolean
    is_apex_domain?: boolean
    dns_instructions?: { type: string; name: string; value: string }
}

interface CustomDomainsProps {
    projectId: string
    orgId: string | null
    subdomain: string | null
    customDomains: CustomDomainRecord[] | undefined
    onRefetch: () => void
}

export function CustomDomains({
    projectId,
    orgId,
    subdomain,
    customDomains,
    onRefetch,
}: CustomDomainsProps) {
    const { getToken } = useAuth()

    const [newDomain, setNewDomain] = useState("")
    const [addingDomain, setAddingDomain] = useState(false)
    const [domainError, setDomainError] = useState<string | null>(null)
    const [verifyingDomain, setVerifyingDomain] = useState<string | null>(null)
    const [checkingStatus, setCheckingStatus] = useState<string | null>(null)
    const [removingDomain, setRemovingDomain] = useState<string | null>(null)
    const [expandedDomain, setExpandedDomain] = useState<string | null>(null)
    const [domainCopied, setDomainCopied] = useState<string | null>(null)
    const [domainResponses, setDomainResponses] = useState<Record<string, DomainResponse>>({})

    const copyDomainValue = (text: string, key: string) => {
        navigator.clipboard.writeText(text)
        setDomainCopied(key)
        setTimeout(() => setDomainCopied(null), 2000)
    }

    const handleAddDomain = async () => {
        if (!newDomain.trim()) return
        setAddingDomain(true)
        setDomainError(null)
        try {
            const token = await getToken()
            const url = new URL(`${API_BASE_URL}/api/projects/${projectId}/domains`)
            if (orgId) url.searchParams.append("org_id", orgId)

            const response = await fetch(url.toString(), {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ domain: newDomain.trim().toLowerCase() }),
            })

            const result = await response.json()
            if (!response.ok) {
                throw new Error(result.detail || "Failed to add domain")
            }

            // Store DNS instructions in domainResponses for immediate display
            setDomainResponses((prev) => ({
                ...prev,
                [result.domain]: { dns_instructions: result.dns_instructions }
            }))
            setNewDomain("")
            setExpandedDomain(result.domain)
            onRefetch()
        } catch (err) {
            setDomainError(err instanceof Error ? err.message : "Failed to add domain")
        } finally {
            setAddingDomain(false)
        }
    }

    const handleVerifyDomain = async (domain: string) => {
        setVerifyingDomain(domain)
        try {
            const token = await getToken()
            const url = new URL(`${API_BASE_URL}/api/projects/${projectId}/domains/${domain}/verify`)
            if (orgId) url.searchParams.append("org_id", orgId)

            const response = await fetch(url.toString(), {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            })

            const result = await response.json()
            setDomainResponses((prev) => ({ ...prev, [domain]: result }))

            if (result.dns_verified) {
                onRefetch()
            }
        } catch (err) {
            console.error("Failed to verify domain:", err)
        } finally {
            setVerifyingDomain(null)
        }
    }

    const handleCheckDomainStatus = async (domain: string) => {
        setCheckingStatus(domain)
        try {
            const token = await getToken()
            const url = new URL(`${API_BASE_URL}/api/projects/${projectId}/domains/${domain}/status`)
            if (orgId) url.searchParams.append("org_id", orgId)

            const response = await fetch(url.toString(), {
                headers: { Authorization: `Bearer ${token}` },
            })

            const result = await response.json()
            setDomainResponses((prev) => ({ ...prev, [domain]: result }))
            onRefetch()
        } catch (err) {
            console.error("Failed to check domain status:", err)
        } finally {
            setCheckingStatus(null)
        }
    }

    const fetchDomainInstructions = async (domain: string) => {
        try {
            const token = await getToken()
            const url = new URL(`${API_BASE_URL}/api/projects/${projectId}/domains/${domain}/status`)
            if (orgId) url.searchParams.append("org_id", orgId)

            const response = await fetch(url.toString(), {
                headers: { Authorization: `Bearer ${token}` },
            })

            const result = await response.json()
            if (result.dns_instructions) {
                setDomainResponses((prev) => ({ 
                    ...prev, 
                    [domain]: { 
                        ...(prev[domain] || {}), 
                        dns_instructions: result.dns_instructions 
                    } 
                }))
            }
        } catch (err) {
            console.error("Failed to fetch domain instructions:", err)
        }
    }

    const handleRemoveDomain = async (domain: string) => {
        setRemovingDomain(domain)
        try {
            const token = await getToken()
            const url = new URL(`${API_BASE_URL}/api/projects/${projectId}/domains/${domain}`)
            if (orgId) url.searchParams.append("org_id", orgId)

            const response = await fetch(url.toString(), {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            })

            if (!response.ok) {
                throw new Error("Failed to remove domain")
            }

            setDomainResponses((prev) => {
                const next = { ...prev }
                delete next[domain]
                return next
            })
            onRefetch()
        } catch (err) {
            console.error("Failed to remove domain:", err)
        } finally {
            setRemovingDomain(null)
        }
    }

    // Auto-poll for PROVISIONING domains
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const pollProvisioningDomains = useCallback(async () => {
        if (!customDomains) return
        const provisioning = customDomains.filter((d) => d.status === "PROVISIONING")
        if (provisioning.length === 0) {
            if (pollingRef.current) {
                clearInterval(pollingRef.current)
                pollingRef.current = null
            }
            return
        }

        for (const d of provisioning) {
            try {
                const token = await getToken()
                const url = new URL(`${API_BASE_URL}/api/projects/${projectId}/domains/${d.domain}/status`)
                if (orgId) url.searchParams.append("org_id", orgId)

                const response = await fetch(url.toString(), {
                    headers: { Authorization: `Bearer ${token}` },
                })
                const result = await response.json()
                setDomainResponses((prev) => ({ ...prev, [d.domain]: result }))

                if (result.status === "ACTIVE") {
                    onRefetch()
                }
            } catch {
                // Silently retry on next interval
            }
        }
    }, [customDomains, getToken, projectId, orgId, onRefetch])

    useEffect(() => {
        const hasProvisioning = customDomains?.some((d) => d.status === "PROVISIONING")
        if (hasProvisioning && !pollingRef.current) {
            pollingRef.current = setInterval(pollProvisioningDomains, 10000) // every 10s
        }
        if (!hasProvisioning && pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
        }
        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current)
                pollingRef.current = null
            }
        }
    }, [customDomains, pollProvisioningDomains])


    const statusBadge = {
        PENDING_VERIFICATION: { bg: "bg-amber-50 border-amber-100", dot: "bg-amber-500", text: "text-amber-700", label: "Pending DNS" },
        PROVISIONING: { bg: "bg-blue-50 border-blue-100", dot: "bg-blue-500 animate-pulse", text: "text-blue-700", label: "Provisioning SSL" },
        ACTIVE: { bg: "bg-emerald-50 border-emerald-100", dot: "bg-emerald-500", text: "text-emerald-700", label: "Active" },
        FAILED: { bg: "bg-red-50 border-red-100", dot: "bg-red-500", text: "text-red-700", label: "Failed" },
    } as const

    return (
        <div className="space-y-6">
            {/* Shorlabs Domain */}
            <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-100">
                    <div className="flex items-center gap-3">
                        <Globe className="h-5 w-5 text-zinc-400" />
                        <h3 className="font-semibold text-zinc-900">Shorlabs Domain</h3>
                    </div>
                </div>
                <div className="px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex-1 bg-zinc-50 rounded-xl px-4 py-3 font-mono text-sm text-zinc-700 border border-zinc-100">
                            {subdomain}.shorlabs.com
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="text-xs font-medium text-emerald-700">Active</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Custom Domains */}
            <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-100">
                    <div className="flex items-center gap-3">
                        <Link2 className="h-5 w-5 text-zinc-400" />
                        <h3 className="font-semibold text-zinc-900">Custom Domains</h3>
                    </div>
                </div>
                <div className="p-6">
                    {/* Add Domain Input */}
                    <div className="flex gap-3 mb-4">
                        <Input
                            placeholder="e.g., api.example.com or example.com"
                            value={newDomain}
                            onChange={(e) => {
                                setNewDomain(e.target.value)
                                setDomainError(null)
                            }}
                            onKeyDown={(e) => e.key === "Enter" && handleAddDomain()}
                            className="flex-1 font-mono text-sm"
                        />
                        <Button
                            onClick={handleAddDomain}
                            disabled={addingDomain || !newDomain.trim()}
                            className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-full px-5"
                        >
                            {addingDomain ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <Plus className="h-4 w-4 mr-2" />
                            )}
                            Add
                        </Button>
                    </div>

                    {domainError && (
                        <div className="flex items-center gap-2 text-sm text-red-600 mb-4">
                            <XCircle className="h-4 w-4" />
                            {domainError}
                        </div>
                    )}

                    {/* Domain List */}
                    {customDomains && customDomains.length > 0 ? (
                        <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl overflow-hidden">
                            {customDomains.map((d) => {
                                const isExpanded = expandedDomain === d.domain
                                const response = domainResponses[d.domain]
                                const dnsInstructions = response?.dns_instructions
                                const badge = statusBadge[d.status] ?? { bg: "bg-zinc-50 border-zinc-100", dot: "bg-zinc-400", text: "text-zinc-600", label: d.status }

                                return (
                                    <div key={d.domain} className="bg-white">
                                        <div
                                            className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-zinc-50 transition-colors"
                                            onClick={() => {
                                                const newExpanded = isExpanded ? null : d.domain
                                                setExpandedDomain(newExpanded)
                                                // Fetch DNS instructions if expanding a PENDING_VERIFICATION domain and we don't have them yet
                                                if (newExpanded && d.status === "PENDING_VERIFICATION" && !domainResponses[d.domain]?.dns_instructions) {
                                                    fetchDomainInstructions(d.domain)
                                                }
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    const newExpanded = isExpanded ? null : d.domain
                                                    setExpandedDomain(newExpanded)
                                                    if (newExpanded && d.status === "PENDING_VERIFICATION" && !domainResponses[d.domain]?.dns_instructions) {
                                                        fetchDomainInstructions(d.domain)
                                                    }
                                                }
                                            }}
                                            role="button"
                                            tabIndex={0}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="font-mono text-sm font-medium text-zinc-900 truncate">{d.domain}</p>
                                                <p className="text-xs text-zinc-400 mt-0.5">
                                                    Added {new Date(d.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                                </p>
                                            </div>
                                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${badge.bg}`}>
                                                <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
                                                <span className={`text-xs font-medium ${badge.text}`}>{badge.label}</span>
                                            </div>
                                            {isExpanded ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
                                        </div>

                                        {isExpanded && (
                                            <div className="px-4 pb-4 border-t border-zinc-100">
                                                {/* PENDING_VERIFICATION: Add CNAME + Verify */}
                                                {d.status === "PENDING_VERIFICATION" && (() => {
                                                    const isApexDomain = response?.is_apex_domain ?? d.domain.split('.').length === 2
                                                    return (
                                                        <div className="mt-3 bg-amber-50 rounded-lg border border-amber-100 p-3">
                                                            <p className="text-sm text-amber-800 font-medium mb-2">Add DNS Record</p>
                                                            
                                                            {isApexDomain && (
                                                                <div className="bg-amber-100 border border-amber-200 rounded-lg p-2.5 mb-3">
                                                                    <p className="text-xs font-semibold text-amber-900 mb-1">⚠️ Apex Domain Warning</p>
                                                                    <p className="text-xs text-amber-800 leading-relaxed">
                                                                        Most DNS providers (like GoDaddy) don't allow CNAME records for apex domains. 
                                                                        If your provider doesn't support CNAME flattening, add <span className="font-mono font-semibold">www.{d.domain}</span> as a CNAME instead, then forward {d.domain} to www.{d.domain}.
                                                                    </p>
                                                                </div>
                                                            )}
                                                            
                                                            <p className="text-xs text-amber-700 mb-3">
                                                                Add a CNAME record at your domain registrar, then click Verify DNS. SSL will be provisioned automatically.
                                                            </p>
                                                            
                                                            <div className="bg-white rounded-lg border border-amber-200 overflow-hidden mb-3">
                                                                <table className="w-full text-xs">
                                                                    <thead className="bg-amber-50/50">
                                                                        <tr>
                                                                            <th className="text-left px-3 py-1.5 text-amber-800 font-medium">Type</th>
                                                                            <th className="text-left px-3 py-1.5 text-amber-800 font-medium">Name</th>
                                                                            <th className="text-left px-3 py-1.5 text-amber-800 font-medium">Value</th>
                                                                            <th className="px-3 py-1.5" />
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        <tr>
                                                                            <td className="px-3 py-1.5 font-mono">{dnsInstructions?.type || "CNAME"}</td>
                                                                            <td className="px-3 py-1.5 font-mono break-all">{dnsInstructions?.name || (d.domain.includes('.') ? d.domain.split('.')[0] : d.domain)}</td>
                                                                            <td className="px-3 py-1.5 font-mono">{dnsInstructions?.value || "Loading..."}</td>
                                                                            <td className="px-3 py-1.5">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => { 
                                                                                        e.stopPropagation(); 
                                                                                        const cnameValue = dnsInstructions?.value
                                                                                        if (cnameValue) {
                                                                                            copyDomainValue(cnameValue, `cname-${d.domain}`)
                                                                                        }
                                                                                    }}
                                                                                    className="p-1 hover:bg-amber-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                                                                    disabled={!dnsInstructions?.value}
                                                                                >
                                                                                    {domainCopied === `cname-${d.domain}` ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-amber-500" />}
                                                                                </button>
                                                                            </td>
                                                                        </tr>
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                            <Button
                                                                size="sm"
                                                                onClick={(e) => { e.stopPropagation(); handleVerifyDomain(d.domain) }}
                                                                disabled={verifyingDomain === d.domain}
                                                                className="bg-amber-600 hover:bg-amber-700 text-white rounded-full h-8 px-4 text-xs"
                                                            >
                                                                {verifyingDomain === d.domain ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                                                                Verify DNS
                                                            </Button>
                                                            {response && !response.dns_verified && response.message && (
                                                                <p className="text-xs text-red-600 mt-2">{response.message}</p>
                                                            )}
                                                            {response && response.dns_verified && response.status === "FAILED" && response.message && (
                                                                <p className="text-xs text-red-600 mt-2">{response.message}</p>
                                                            )}
                                                        </div>
                                                    )
                                                })()}

                                                {/* PROVISIONING */}
                                                {d.status === "PROVISIONING" && (
                                                    <div className="mt-3 bg-blue-50 rounded-lg border border-blue-100 p-3">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                                                            <p className="text-sm text-blue-800 font-medium">Provisioning SSL Certificate</p>
                                                        </div>
                                                        <p className="text-xs text-blue-700 mb-3">
                                                            DNS is verified. Your SSL certificate is being provisioned automatically.
                                                            This typically takes 1-5 minutes. The page will update when ready.
                                                        </p>
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex-1 bg-blue-100 rounded-full h-1.5 overflow-hidden">
                                                                <div className="bg-blue-500 h-full rounded-full animate-pulse w-2/3" />
                                                            </div>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={(e) => { e.stopPropagation(); handleCheckDomainStatus(d.domain) }}
                                                                disabled={checkingStatus === d.domain}
                                                                className="rounded-full h-7 px-3 text-xs border-blue-200 text-blue-700 hover:bg-blue-100"
                                                            >
                                                                {checkingStatus === d.domain ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                                                                Check Now
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ACTIVE */}
                                                {d.status === "ACTIVE" && (
                                                    <div className="mt-3 bg-emerald-50 rounded-lg border border-emerald-100 p-3">
                                                        <div className="flex items-center gap-2">
                                                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                                            <p className="text-sm text-emerald-800 font-medium">
                                                                Domain is active and serving traffic at https://{d.domain}
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* FAILED */}
                                                {d.status === "FAILED" && (
                                                    <div className="mt-3 bg-red-50 rounded-lg border border-red-100 p-3">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <XCircle className="h-4 w-4 text-red-600" />
                                                            <p className="text-sm text-red-800 font-medium">Domain configuration failed</p>
                                                        </div>
                                                        <p className="text-xs text-red-700 mb-3">
                                                            {response?.message || "Try verifying DNS again."}
                                                        </p>
                                                        <Button
                                                            size="sm"
                                                            onClick={(e) => { e.stopPropagation(); handleVerifyDomain(d.domain) }}
                                                            disabled={verifyingDomain === d.domain}
                                                            className="bg-red-600 hover:bg-red-700 text-white rounded-full h-8 px-4 text-xs"
                                                        >
                                                            {verifyingDomain === d.domain ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                                                            Retry
                                                        </Button>
                                                    </div>
                                                )}

                                                {/* Remove */}
                                                <div className="mt-3 flex justify-end">
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={(e) => e.stopPropagation()}
                                                                disabled={removingDomain === d.domain}
                                                                className="text-red-600 border-red-200 hover:bg-red-50 rounded-full h-8 px-4 text-xs"
                                                            >
                                                                {removingDomain === d.domain ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Trash2 className="h-3 w-3 mr-1" />}
                                                                Remove
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Remove domain</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    Are you sure you want to remove <span className="font-mono font-medium">{d.domain}</span>? This will delete the SSL certificate and DNS configuration. This action cannot be undone.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction
                                                                    onClick={() => handleRemoveDomain(d.domain)}
                                                                    className="bg-red-600 hover:bg-red-700 text-white"
                                                                >
                                                                    Remove domain
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-8 border border-zinc-200 rounded-xl">
                            <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-3">
                                <Globe className="h-6 w-6 text-zinc-400" />
                            </div>
                            <p className="text-sm text-zinc-500">No custom domains added yet</p>
                            <p className="text-xs text-zinc-400 mt-1">Add a domain above to get started</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
