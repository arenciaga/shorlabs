import {
    Shield,
    ShieldCheck,
    ShieldAlert,
    RefreshCw,
    Loader2,
    Globe,
    Trash2,
    Plus,
    Info,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { SecurityRulesResponse } from "@/lib/api"

interface DatabaseSecurityTabProps {
    securityRules: SecurityRulesResponse | null
    loadingRules: boolean
    isOpenAccess: boolean
    togglingAccess: boolean
    userIpRules: Array<{
        rule_id: string
        cidr_ipv4?: string | null
        cidr_ipv6?: string | null
        description?: string | null
    }>
    userIp: string | null
    newIpCidr: string
    newIpLabel: string
    addingRule: boolean
    deletingRuleId: string | null
    onRefresh: () => void
    onToggleAccessMode: (mode: "open" | "restricted") => void
    onAddIp: (cidr?: string, label?: string) => void
    onDeleteRule: (ruleId: string) => void
    onNewIpCidrChange: (value: string) => void
    onNewIpLabelChange: (value: string) => void
}

export function DatabaseSecurityTab({
    securityRules,
    loadingRules,
    isOpenAccess,
    togglingAccess,
    userIpRules,
    userIp,
    newIpCidr,
    newIpLabel,
    addingRule,
    deletingRuleId,
    onRefresh,
    onToggleAccessMode,
    onAddIp,
    onDeleteRule,
    onNewIpCidrChange,
    onNewIpLabelChange,
}: DatabaseSecurityTabProps) {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-zinc-50 rounded-none border border-zinc-200 p-4 sm:p-6">
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3">
                        <Shield className="h-5 w-5 text-zinc-400" />
                        <h3 className="font-semibold text-zinc-900">Network Access</h3>
                    </div>
                    <button
                        onClick={onRefresh}
                        disabled={loadingRules}
                        className="text-zinc-400 hover:text-zinc-600 transition-colors"
                    >
                        <RefreshCw className={`h-4 w-4 ${loadingRules ? "animate-spin" : ""}`} />
                    </button>
                </div>
                <p className="text-sm text-zinc-500 ml-8">Control which IP addresses can connect to your database. SSL/TLS is always enforced.</p>
            </div>

            {loadingRules && !securityRules ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                </div>
            ) : (
                <>
                    {/* Access Mode Toggle */}
                    <div className="bg-zinc-50 rounded-none border border-zinc-200 p-4 sm:p-6">
                        <h4 className="text-sm font-medium text-zinc-900 mb-4">Access Mode</h4>
                        <div className="space-y-3">
                            {/* Open Mode */}
                            <button
                                onClick={() => onToggleAccessMode("open")}
                                disabled={togglingAccess || isOpenAccess}
                                className={`w-full text-left px-4 py-3 border transition-colors ${isOpenAccess
                                    ? "border-zinc-900 bg-white"
                                    : "border-zinc-200 bg-white hover:border-zinc-300"
                                    }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${isOpenAccess ? "border-zinc-900" : "border-zinc-300"
                                        }`}>
                                        {isOpenAccess && <div className="w-2 h-2 rounded-full bg-zinc-900" />}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <ShieldCheck className="h-4 w-4 text-emerald-500" />
                                            <span className="text-sm font-medium text-zinc-900">Open</span>
                                            <span className="text-xs text-zinc-400 bg-zinc-100 px-1.5 py-0.5">Recommended</span>
                                        </div>
                                        <p className="text-xs text-zinc-500 mt-1">
                                            Any IP with valid credentials can connect. Your Shorlabs backends connect automatically.
                                        </p>
                                    </div>
                                </div>
                            </button>

                            {/* Restricted Mode */}
                            <button
                                onClick={() => onToggleAccessMode("restricted")}
                                disabled={togglingAccess || !isOpenAccess}
                                className={`w-full text-left px-4 py-3 border transition-colors ${!isOpenAccess
                                    ? "border-zinc-900 bg-white"
                                    : "border-zinc-200 bg-white hover:border-zinc-300"
                                    }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${!isOpenAccess ? "border-zinc-900" : "border-zinc-300"
                                        }`}>
                                        {!isOpenAccess && <div className="w-2 h-2 rounded-full bg-zinc-900" />}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <ShieldAlert className="h-4 w-4 text-amber-500" />
                                            <span className="text-sm font-medium text-zinc-900">Restricted</span>
                                        </div>
                                        <p className="text-xs text-zinc-500 mt-1">
                                            Only specific IP addresses can connect.
                                        </p>
                                    </div>
                                </div>
                            </button>
                        </div>

                        {togglingAccess && (
                            <div className="flex items-center gap-2 mt-3 text-sm text-zinc-500">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Updating access mode...
                            </div>
                        )}

                        {/* Warning for restricted mode */}
                        {!isOpenAccess && (
                            <div className="flex items-start gap-2.5 mt-4 px-3 py-2.5 bg-amber-50 border border-amber-200">
                                <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                                <p className="text-xs text-amber-800">
                                    <strong>Heads up:</strong> Shorlabs-deployed backends use dynamic IPs. If you restrict access, your Shorlabs backend may not be able to connect to this database. Add your backend&apos;s IPs below or switch back to Open.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Allowed IPs Section — shown when restricted */}
                    {!isOpenAccess && (
                        <div className="bg-zinc-50 rounded-none border border-zinc-200 p-4 sm:p-6">
                            <h4 className="text-sm font-medium text-zinc-900 mb-4">Allowed IPs</h4>

                            {/* IP List */}
                            {userIpRules.length === 0 ? (
                                <div className="bg-white border border-zinc-200 rounded-none p-6 flex flex-col items-center justify-center text-center mb-4">
                                    <Globe className="h-7 w-7 text-zinc-300 mb-2" />
                                    <p className="text-sm text-zinc-500">No IPs added yet</p>
                                    <p className="text-xs text-zinc-400 mt-1">
                                        Add IP addresses that should be allowed to connect to your database.
                                    </p>
                                </div>
                            ) : (
                                <div className="bg-white border border-zinc-200 rounded-none overflow-hidden mb-4">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-zinc-200 bg-zinc-50">
                                                <th className="text-left px-4 py-2 font-medium text-zinc-600">IP / CIDR</th>
                                                <th className="text-left px-4 py-2 font-medium text-zinc-600">Label</th>
                                                <th className="px-4 py-2 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {userIpRules.map((rule) => (
                                                <tr key={rule.rule_id} className="border-b border-zinc-100 last:border-0">
                                                    <td className="px-4 py-2.5 font-mono text-zinc-700">
                                                        {rule.cidr_ipv4 || rule.cidr_ipv6 || "-"}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-zinc-500">
                                                        {rule.description || "-"}
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <button
                                                            onClick={() => onDeleteRule(rule.rule_id)}
                                                            disabled={deletingRuleId === rule.rule_id}
                                                            className="text-zinc-400 hover:text-red-500 transition-colors disabled:opacity-50"
                                                        >
                                                            {deletingRuleId === rule.rule_id ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <Trash2 className="h-4 w-4" />
                                                            )}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Add IP Form */}
                            <div className="border-t border-zinc-200 pt-4">
                                <h4 className="text-sm font-medium text-zinc-700 mb-3">Add IP Address</h4>
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <Input
                                        placeholder="IP or CIDR (e.g. 203.0.113.0/24)"
                                        value={newIpCidr}
                                        onChange={(e) => onNewIpCidrChange(e.target.value)}
                                        className="rounded-none flex-1"
                                    />
                                    <Input
                                        placeholder="Label (optional)"
                                        value={newIpLabel}
                                        onChange={(e) => onNewIpLabelChange(e.target.value)}
                                        className="rounded-none flex-1 sm:max-w-[200px]"
                                    />
                                    <Button
                                        onClick={() => onAddIp()}
                                        disabled={addingRule || !newIpCidr}
                                        className="rounded-none shrink-0"
                                    >
                                        {addingRule ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                                        Add
                                    </Button>
                                </div>
                            </div>

                            {/* Add My IP shortcut */}
                            {userIp && (
                                <div className="flex items-center gap-2 mt-4 px-3 py-2.5 bg-blue-50 border border-blue-200">
                                    <Info className="h-4 w-4 text-blue-500 shrink-0" />
                                    <span className="text-xs text-blue-800">Your current IP: <code className="font-mono bg-blue-100 px-1 py-0.5">{userIp}</code></span>
                                    <button
                                        onClick={() => onAddIp(userIp, "My IP")}
                                        disabled={addingRule || userIpRules.some(r => r.cidr_ipv4 === `${userIp}/32`)}
                                        className="ml-auto text-xs font-medium text-blue-700 hover:text-blue-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                                    >
                                        {userIpRules.some(r => r.cidr_ipv4 === `${userIp}/32`) ? "✓ Added" : "+ Add my IP"}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* SSL info — always shown */}
                    <div className="bg-zinc-50 rounded-none border border-zinc-200 p-4 sm:p-6">
                        <div className="flex items-center gap-3 mb-2">
                            <ShieldCheck className="h-5 w-5 text-emerald-500" />
                            <h4 className="text-sm font-medium text-zinc-900">Encryption</h4>
                        </div>
                        <p className="text-sm text-zinc-500 ml-8">
                            All connections use SSL/TLS encryption. Credentials are managed and auto-rotated via AWS Secrets Manager.
                        </p>
                    </div>
                </>
            )}
        </div>
    )
}
