/**
 * SonicSentinel Admin Dashboard
 *
 * SECURITY:
 * - Only rendered when user.role === 'admin' (verified by /auth/me on the server).
 * - Every API call goes through /api/admin/* which enforces requireAdmin server-side.
 * - No admin credentials or secrets are stored in this file.
 * - Admin dashboard is NOT accessible to normal users.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, AlertTriangle, AudioLines, Bell, CheckCircle2,
  ChevronLeft, ChevronRight, Database, FileText, Loader2,
  LogOut, RefreshCw, Search, Server, Settings, Shield,
  Trash2, User, UserCheck, UserX, Users, X, Zap,
  BarChart2, Clock, Eye, Filter, Globe, Lock, MonitorSmartphone,
  PieChart, Sparkles, TrendingUp
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart as RechartsPieChart,
  Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { adminApi } from '../api/admin';
import { authApi, type User as UserType } from '../api/auth';
import { Logo } from '../brand';

// ============================================================
// TYPES
// ============================================================
type AdminPage =
  | 'Overview'
  | 'Users'
  | 'Detections'
  | 'Alerts'
  | 'Reports'
  | 'Models'
  | 'Logs'
  | 'System'
  | 'Settings';

interface OverviewData {
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
  totalDetections: number;
  totalAlerts: number;
  totalReviews: number;
  unresolvedAlerts: number;
  recentDetections7d: number;
  recentAlerts7d: number;
  severityDistribution: Record<string, number>;
  classDistribution: Record<string, number>;
  databaseEngine: string;
  modelStatus: string;
}

// ============================================================
// UTILITIES
// ============================================================
const pct = (v: number) => `${Math.round(v * 100)}%`;
const fmtDate = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(+d) ? '—' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

const SEV_COLOR: Record<string, string> = {
  critical: '#ff3366',
  high: '#ffb800',
  medium: '#7b61ff',
  low: '#5a6a6c',
};

const CLASS_COLORS = ['#00f0ff', '#ff3366', '#ffb800', '#2fe0a8', '#7b61ff', '#ff5c85', '#00d4ff', '#5a6a6c'];

function SevBadge({ severity }: { severity: string }) {
  const color = SEV_COLOR[severity] || '#5a6a6c';
  return (
    <span style={{ color, background: `${color}22`, border: `1px solid ${color}55` }}
      className="admin-sev-badge">
      {severity?.toUpperCase() || 'LOW'}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role === 'admin';
  return (
    <span className={`admin-role-badge ${isAdmin ? 'admin' : 'user'}`}>
      {isAdmin ? <Shield size={11} /> : <User size={11} />}
      {role?.toUpperCase()}
    </span>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={`admin-active-badge ${active ? 'active' : 'inactive'}`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string | number; icon: React.ElementType; color: string; sub?: string;
}) {
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-top">
        <span className="admin-stat-label">{label}</span>
        <div className={`admin-stat-icon ${color}`}><Icon size={18} /></div>
      </div>
      <strong className={`admin-stat-value text-${color}`}>{typeof value === 'number' ? value.toLocaleString() : value}</strong>
      {sub && <p className="admin-stat-sub">{sub}</p>}
    </div>
  );
}

// ============================================================
// OVERVIEW PAGE
// ============================================================
function AdminOverview({ user }: { user: UserType }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await adminApi.overview();
      setData(r.data);
    } catch {
      // handled via 403 → UI shows forbidden
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [load]);

  if (loading) return <div className="admin-loading"><Loader2 className="spin" size={32} /></div>;
  if (!data) return <div className="admin-error">Failed to load overview data.</div>;

  const sevData = Object.entries(data.severityDistribution).map(([name, value]) => ({ name, value }));
  const classData = Object.entries(data.classDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value], i) => ({ name, value, fill: CLASS_COLORS[i % CLASS_COLORS.length] }));

  return (
    <div className="admin-page-content">
      <div className="admin-page-header">
        <h2>Welcome back, {user?.role === 'admin' ? 'Admin' : user?.name || 'there'}!</h2>
        <p className="muted">Platform overview — real-time SonicSentinel statistics across all users</p>
      </div>

      {/* KPI Grid */}
      <div className="admin-kpi-grid">
        <StatCard label="Total Users" value={data.totalUsers} icon={Users} color="cyan" sub={`${data.activeUsers} active`} />
        <StatCard label="Total Detections" value={data.totalDetections} icon={AudioLines} color="emerald" sub={`${data.recentDetections7d} last 7d`} />
        <StatCard label="Total Alerts" value={data.totalAlerts} icon={Bell} color="crimson" sub={`${data.unresolvedAlerts} unresolved`} />
        <StatCard label="Model Status" value={data.modelStatus === 'loaded' ? 'Loaded' : 'Baseline'} icon={Sparkles} color="purple" sub={data.databaseEngine} />
      </div>

      {/* Charts Row */}
      <div className="admin-charts-row">
        {/* Severity Distribution */}
        <div className="admin-chart-card">
          <h3>Severity Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={sevData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="name" stroke="#5a6a6c" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#5a6a6c" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#0a101d', border: '1px solid rgba(0,240,255,0.2)', borderRadius: 6 }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {sevData.map((entry) => (
                  <Cell key={entry.name} fill={SEV_COLOR[entry.name] || '#5a6a6c'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Class Distribution */}
        <div className="admin-chart-card">
          <h3>Class Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <RechartsPieChart>
              <Pie data={classData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} paddingAngle={3}>
                {classData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: '#0a101d', border: '1px solid rgba(0,240,255,0.2)', borderRadius: 6 }} />
            </RechartsPieChart>
          </ResponsiveContainer>
          <div className="admin-pie-legend">
            {classData.slice(0, 4).map(c => (
              <span key={c.name} className="admin-pie-legend-item">
                <span className="dot" style={{ background: c.fill }} />
                {c.name}: {c.value}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Status Row */}
      <div className="admin-status-row">
        <div className="admin-status-card">
          <Database size={16} className="text-cyan" />
          <span className="label">Database</span>
          <span className="value">{data.databaseEngine.toUpperCase()}</span>
        </div>
        <div className="admin-status-card">
          <Sparkles size={16} className="text-emerald" />
          <span className="label">ML Model</span>
          <span className="value">{data.modelStatus}</span>
        </div>
        <div className="admin-status-card">
          <Users size={16} className="text-purple" />
          <span className="label">Admin Users</span>
          <span className="value">{data.adminUsers}</span>
        </div>
        <div className="admin-status-card">
          <AlertTriangle size={16} className="text-crimson" />
          <span className="label">Unresolved Alerts</span>
          <span className="value">{data.unresolvedAlerts}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// USER MANAGEMENT PAGE
// ============================================================
function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(0);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const PER_PAGE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { limit: PER_PAGE, offset: page * PER_PAGE };
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      if (activeFilter !== '') params.active = activeFilter === 'true';
      const r = await adminApi.listUsers(params);
      setUsers(r.data.users);
      setTotal(r.data.total);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, activeFilter, page]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    load();
  };

  const toggleActive = async (u: any) => {
    setActionLoading(true);
    setMsg('');
    try {
      await adminApi.updateUser(u.id, { active: !u.active });
      setMsg(`User ${u.name} ${u.active ? 'deactivated' : 'activated'} successfully.`);
      load();
      if (selectedUser?.id === u.id) setSelectedUser({ ...selectedUser, active: !u.active });
    } catch (err: any) {
      setMsg(err.response?.data?.detail ?? 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const deleteUser = async (u: any) => {
    if (!confirm(`Delete user ${u.name} (${u.email}) and ALL their data? This cannot be undone.`)) return;
    setActionLoading(true);
    setMsg('');
    try {
      await adminApi.deleteUser(u.id);
      setMsg(`User ${u.name} deleted.`);
      setSelectedUser(null);
      load();
    } catch (err: any) {
      setMsg(err.response?.data?.detail ?? 'Delete failed.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="admin-page-content">
      <div className="admin-page-header">
        <h2>User Management</h2>
        <p className="muted">Manage all platform users</p>
      </div>

      {msg && (
        <div className={`admin-msg-bar ${msg.includes('failed') || msg.includes('Failed') ? 'error' : 'success'}`}>
          {msg}
          <button onClick={() => setMsg('')}><X size={14} /></button>
        </div>
      )}

      {/* Filters */}
      <div className="admin-filter-row">
        <form onSubmit={handleSearch} className="admin-search-form">
          <Search size={15} className="text-muted" />
          <input
            className="admin-search-input"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button type="submit" className="admin-btn-sm primary">Search</button>
        </form>
        <select className="admin-select" value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(0); }}>
          <option value="">All Roles</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
        <select className="admin-select" value={activeFilter} onChange={e => { setActiveFilter(e.target.value as any); setPage(0); }}>
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <button className="admin-btn-sm ghost" onClick={() => { setSearch(''); setRoleFilter(''); setActiveFilter(''); setPage(0); }}>
          <RefreshCw size={14} /> Reset
        </button>
      </div>

      <div className="admin-table-wrapper">
        {loading ? (
          <div className="admin-loading"><Loader2 className="spin" size={28} /></div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Detections</th>
                <th>Alerts</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={8} className="admin-empty-cell">No users found</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className={selectedUser?.id === u.id ? 'selected' : ''}>
                  <td>
                    <button className="admin-user-name-btn" onClick={() => setSelectedUser(u)}>
                      <div className="admin-user-avatar">{(u.name || 'U').slice(0, 2).toUpperCase()}</div>
                      <span>{u.name}</span>
                    </button>
                  </td>
                  <td className="text-muted">{u.email}</td>
                  <td><RoleBadge role={u.role} /></td>
                  <td><ActiveBadge active={u.active} /></td>
                  <td>{u.detectionCount}</td>
                  <td>{u.alertCount}</td>
                  <td className="text-muted">{fmtDate(u.createdAt).split(' ')[0]}</td>
                  <td>
                    <div className="admin-action-btns">
                      <button
                        className={`admin-btn-xs ${u.active ? 'warning' : 'success'}`}
                        onClick={() => toggleActive(u)}
                        disabled={actionLoading || u.role === 'admin'}
                        title={u.role === 'admin' ? 'Cannot deactivate admin via UI' : (u.active ? 'Deactivate' : 'Activate')}
                      >
                        {u.active ? <UserX size={13} /> : <UserCheck size={13} />}
                      </button>
                      <button
                        className="admin-btn-xs danger"
                        onClick={() => deleteUser(u)}
                        disabled={actionLoading || u.role === 'admin'}
                        title={u.role === 'admin' ? 'Cannot delete admin via UI' : 'Delete user'}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="admin-pagination">
        <span className="text-muted">Showing {Math.min(page * PER_PAGE + 1, total)}–{Math.min((page + 1) * PER_PAGE, total)} of {total}</span>
        <div className="admin-page-btns">
          <button className="admin-btn-sm ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft size={14} /> Prev
          </button>
          <button className="admin-btn-sm ghost" disabled={(page + 1) * PER_PAGE >= total} onClick={() => setPage(p => p + 1)}>
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* User Detail Drawer */}
      <AnimatePresence>
        {selectedUser && (
          <motion.div
            className="admin-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedUser(null)}
          >
            <motion.div
              className="admin-drawer"
              initial={{ x: 400 }}
              animate={{ x: 0 }}
              exit={{ x: 400 }}
              transition={{ type: 'spring', damping: 26 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="admin-drawer-head">
                <h3>User Detail</h3>
                <button onClick={() => setSelectedUser(null)}><X size={18} /></button>
              </div>
              <div className="admin-drawer-body">
                <div className="admin-user-profile">
                  <div className="admin-avatar-lg">{(selectedUser.name || 'U').slice(0, 2).toUpperCase()}</div>
                  <h4>{selectedUser.name}</h4>
                  <p className="text-muted">{selectedUser.email}</p>
                  <div className="admin-drawer-badges">
                    <RoleBadge role={selectedUser.role} />
                    <ActiveBadge active={selectedUser.active} />
                  </div>
                </div>
                <div className="admin-drawer-stats">
                  <div className="admin-dstat"><span>Detections</span><b>{selectedUser.detectionCount}</b></div>
                  <div className="admin-dstat"><span>Alerts</span><b>{selectedUser.alertCount}</b></div>
                  <div className="admin-dstat"><span>Joined</span><b>{fmtDate(selectedUser.createdAt).split(' ')[0]}</b></div>
                  <div className="admin-dstat"><span>OAuth</span><b>{[selectedUser.hasGoogle && 'Google', selectedUser.hasFacebook && 'Facebook'].filter(Boolean).join(', ') || 'None'}</b></div>
                </div>
                {selectedUser.role !== 'admin' && (
                  <div className="admin-drawer-actions">
                    <button
                      className={`admin-btn full-width ${selectedUser.active ? 'warning' : 'success'}`}
                      onClick={() => toggleActive(selectedUser)}
                      disabled={actionLoading}
                    >
                      {selectedUser.active ? <><UserX size={15} /> Deactivate Account</> : <><UserCheck size={15} /> Activate Account</>}
                    </button>
                    <button
                      className="admin-btn full-width danger"
                      onClick={() => deleteUser(selectedUser)}
                      disabled={actionLoading}
                    >
                      <Trash2 size={15} /> Delete User & Data
                    </button>
                  </div>
                )}
                {selectedUser.role === 'admin' && (
                  <div className="admin-drawer-note">
                    <Shield size={15} className="text-cyan" />
                    Admin accounts cannot be modified or deleted through the UI.
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// DETECTIONS PAGE
// ============================================================
function AdminDetections() {
  const [detections, setDetections] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sevFilter, setSevFilter] = useState('');
  const [page, setPage] = useState(0);
  const PER_PAGE = 30;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { limit: PER_PAGE, offset: page * PER_PAGE };
      if (sevFilter) params.severity = sevFilter;
      const r = await adminApi.listDetections(params);
      setDetections(r.data.detections);
      setTotal(r.data.total);
    } finally {
      setLoading(false);
    }
  }, [sevFilter, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="admin-page-content">
      <div className="admin-page-header">
        <h2>Platform Detections</h2>
        <p className="muted">All audio detections across all users</p>
      </div>
      <div className="admin-filter-row">
        <select className="admin-select" value={sevFilter} onChange={e => { setSevFilter(e.target.value); setPage(0); }}>
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button className="admin-btn-sm ghost" onClick={() => { setSevFilter(''); setPage(0); }}>
          <RefreshCw size={14} /> Reset
        </button>
        <span className="text-muted" style={{ marginLeft: 'auto' }}>Total: {total}</span>
      </div>
      <div className="admin-table-wrapper">
        {loading ? (
          <div className="admin-loading"><Loader2 className="spin" size={28} /></div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Classification</th>
                <th>Confidence</th>
                <th>Severity</th>
                <th>Source</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {detections.length === 0 ? (
                <tr><td colSpan={7} className="admin-empty-cell">No detections found</td></tr>
              ) : detections.map(d => (
                <tr key={d.id}>
                  <td className="text-muted">{fmtDate(d.createdAt)}</td>
                  <td>
                    <div className="admin-user-inline">
                      <span>{d.userName}</span>
                      <span className="text-muted" style={{ fontSize: 11 }}>{d.userEmail}</span>
                    </div>
                  </td>
                  <td><b>{d.classification}</b></td>
                  <td>{pct(d.confidence)}</td>
                  <td><SevBadge severity={d.severity} /></td>
                  <td><span className="admin-source-tag">{d.source}</span></td>
                  <td><span className="admin-status-tag">{d.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="admin-pagination">
        <span className="text-muted">{Math.min(page * PER_PAGE + 1, total)}–{Math.min((page + 1) * PER_PAGE, total)} of {total}</span>
        <div className="admin-page-btns">
          <button className="admin-btn-sm ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft size={14} /> Prev
          </button>
          <button className="admin-btn-sm ghost" disabled={(page + 1) * PER_PAGE >= total} onClick={() => setPage(p => p + 1)}>
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ALERTS PAGE
// ============================================================
function AdminAlerts() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sevFilter, setSevFilter] = useState('');
  const [page, setPage] = useState(0);
  const PER_PAGE = 30;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { limit: PER_PAGE, offset: page * PER_PAGE };
      if (sevFilter) params.severity = sevFilter;
      const r = await adminApi.listAlerts(params);
      setAlerts(r.data.alerts);
      setTotal(r.data.total);
    } finally {
      setLoading(false);
    }
  }, [sevFilter, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="admin-page-content">
      <div className="admin-page-header">
        <h2>Platform Alerts</h2>
        <p className="muted">All acoustic threat alerts across the platform</p>
      </div>
      <div className="admin-filter-row">
        <select className="admin-select" value={sevFilter} onChange={e => { setSevFilter(e.target.value); setPage(0); }}>
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button className="admin-btn-sm ghost" onClick={() => { setSevFilter(''); setPage(0); }}>
          <RefreshCw size={14} /> Reset
        </button>
        <span className="text-muted" style={{ marginLeft: 'auto' }}>Total: {total}</span>
      </div>
      <div className="admin-table-wrapper">
        {loading ? (
          <div className="admin-loading"><Loader2 className="spin" size={28} /></div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Label</th>
                <th>Severity</th>
                <th>Read</th>
                <th>Resolved</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 ? (
                <tr><td colSpan={6} className="admin-empty-cell">No alerts found</td></tr>
              ) : alerts.map(a => (
                <tr key={a.id}>
                  <td className="text-muted">{fmtDate(a.createdAt)}</td>
                  <td>
                    <div className="admin-user-inline">
                      <span>{a.userName}</span>
                      <span className="text-muted" style={{ fontSize: 11 }}>{a.userEmail}</span>
                    </div>
                  </td>
                  <td><b>{a.label || '—'}</b></td>
                  <td><SevBadge severity={a.severity} /></td>
                  <td>{a.read ? <CheckCircle2 size={15} className="text-emerald" /> : <span className="text-muted">—</span>}</td>
                  <td>{a.resolved ? <CheckCircle2 size={15} className="text-emerald" /> : <span className="text-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="admin-pagination">
        <span className="text-muted">{Math.min(page * PER_PAGE + 1, total)}–{Math.min((page + 1) * PER_PAGE, total)} of {total}</span>
        <div className="admin-page-btns">
          <button className="admin-btn-sm ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft size={14} /> Prev
          </button>
          <button className="admin-btn-sm ghost" disabled={(page + 1) * PER_PAGE >= total} onClick={() => setPage(p => p + 1)}>
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// REPORTS PAGE
// ============================================================
function AdminReports() {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.reports().then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="admin-loading"><Loader2 className="spin" size={32} /></div>;
  if (!data) return <div className="admin-error">Failed to load reports.</div>;

  return (
    <div className="admin-page-content">
      <div className="admin-page-header">
        <h2>Platform Reports</h2>
        <p className="muted">Platform-wide statistics and analytics</p>
      </div>

      <div className="admin-kpi-grid">
        <StatCard label="Total Users" value={data.totalUsers} icon={Users} color="cyan" sub={`${data.newUsers7d} new last 7d`} />
        <StatCard label="Total Detections" value={data.totalDetections} icon={AudioLines} color="emerald" sub={`Avg conf: ${data.averageConfidence}%`} />
        <StatCard label="Total Alerts" value={data.totalAlerts} icon={Bell} color="crimson" sub={`${data.unresolvedAlerts} unresolved`} />
        <StatCard label="Model" value={data.modelStatus} icon={Sparkles} color="purple" sub={data.databaseEngine} />
      </div>

      {/* Activity Chart */}
      <div className="admin-chart-card wide">
        <h3>Detection Activity (Last 14 Days)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data.activity14d} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00f0ff" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#00f0ff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="date" stroke="#5a6a6c" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="#5a6a6c" fontSize={10} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: '#0a101d', border: '1px solid rgba(0,240,255,0.2)', borderRadius: 6 }} />
            <Area type="monotone" dataKey="count" stroke="#00f0ff" strokeWidth={2} fill="url(#actGrad)" name="Detections" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Severity breakdown */}
      <div className="admin-reports-grid">
        <div className="admin-report-card">
          <h4>By Severity</h4>
          {Object.entries(data.severityDistribution).map(([sev, cnt]) => (
            <div key={sev} className="admin-report-row">
              <SevBadge severity={sev} />
              <div className="admin-report-bar-wrap">
                <div className="admin-report-bar" style={{ width: `${Math.round(Number(cnt) / Math.max(1, data.totalDetections) * 100)}%`, background: SEV_COLOR[sev] }} />
              </div>
              <span>{cnt as number}</span>
            </div>
          ))}
        </div>
        <div className="admin-report-card">
          <h4>By Classification</h4>
          {Object.entries(data.classDistribution).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 6).map(([cls, cnt], i) => (
            <div key={cls} className="admin-report-row">
              <span style={{ color: CLASS_COLORS[i % CLASS_COLORS.length] }}>{cls}</span>
              <div className="admin-report-bar-wrap">
                <div className="admin-report-bar" style={{ width: `${Math.round(Number(cnt) / Math.max(1, data.totalDetections) * 100)}%`, background: CLASS_COLORS[i % CLASS_COLORS.length] }} />
              </div>
              <span>{cnt as number}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SYSTEM PAGE
// ============================================================
function AdminSystem() {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.system().then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="admin-loading"><Loader2 className="spin" size={32} /></div>;

  return (
    <div className="admin-page-content">
      <div className="admin-page-header">
        <h2>System Health</h2>
        <p className="muted">API and infrastructure status</p>
      </div>
      <div className="admin-system-grid">
        {data && Object.entries(data).map(([key, val]) => (
          <div key={key} className="admin-system-card">
            <span className="admin-sys-key">{key}</span>
            <span className="admin-sys-val">{String(val)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// LOGS PAGE
// ============================================================
function AdminLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi.logs(100);
      setLogs(r.data.logs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="admin-page-content">
      <div className="admin-page-header">
        <h2>Activity Logs</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="admin-btn-sm ghost" onClick={load}><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>
      <div className="admin-table-wrapper">
        {loading ? (
          <div className="admin-loading"><Loader2 className="spin" size={28} /></div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Event</th>
                <th>Classification</th>
                <th>Confidence</th>
                <th>Severity</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={7} className="admin-empty-cell">No logs found</td></tr>
              ) : logs.map((log, i) => (
                <tr key={i}>
                  <td className="text-muted">{fmtDate(log.timestamp)}</td>
                  <td>{log.userName}</td>
                  <td><span className="admin-source-tag">{log.event}</span></td>
                  <td><b>{log.classification}</b></td>
                  <td>{pct(log.confidence)}</td>
                  <td><SevBadge severity={log.severity} /></td>
                  <td>{log.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MODELS PAGE
// ============================================================
function AdminModels() {
  const [system, setSystem] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.system().then(r => setSystem(r.data)).finally(() => setLoading(false));
  }, []);

  return (
    <div className="admin-page-content">
      <div className="admin-page-header">
        <h2>Model Information</h2>
        <p className="muted">ML model status and configuration</p>
      </div>
      {loading ? <div className="admin-loading"><Loader2 className="spin" size={28} /></div> : (
        <div className="admin-model-cards">
          <div className="admin-model-card">
            <div className="admin-model-icon"><Sparkles size={24} className="text-cyan" /></div>
            <h4>Python ML Engine</h4>
            <p className="text-muted">Baseline acoustic classifier</p>
            <div className="admin-model-badge">{system?.modelStatus === 'loaded' ? 'Loaded' : 'Baseline'}</div>
            <div className="admin-model-meta">
              <span>Version: baseline-1.0</span>
              <span>Type: Python sklearn</span>
            </div>
          </div>
          <div className="admin-model-card">
            <div className="admin-model-icon"><Globe size={24} className="text-purple" /></div>
            <h4>Teachable Machine Adapter</h4>
            <p className="text-muted">Browser-based ML model</p>
            <div className="admin-model-badge inactive">Not Configured</div>
            <div className="admin-model-meta">
              <span>Set TEACHABLE_MACHINE_MODEL_URL to enable</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SETTINGS PAGE (Admin Settings)
// ============================================================
function AdminSettings({ adminUser, onLogout }: { adminUser: UserType; onLogout: () => void }) {
  return (
    <div className="admin-page-content">
      <div className="admin-page-header">
        <h2>Admin Settings</h2>
        <p className="muted">Platform configuration and admin account</p>
      </div>
      <div className="admin-settings-grid">
        <div className="admin-settings-card">
          <h4>Admin Account</h4>
          <div className="admin-settings-row">
            <span>Name</span><b>{adminUser.name}</b>
          </div>
          <div className="admin-settings-row">
            <span>Email</span><b>{adminUser.email}</b>
          </div>
          <div className="admin-settings-row">
            <span>Role</span><RoleBadge role={adminUser.role} />
          </div>
        </div>
        <div className="admin-settings-card">
          <h4>Admin Creation</h4>
          <p className="text-muted" style={{ marginBottom: 12 }}>
            Admin accounts can only be created via the secure CLI tool.<br />
            Never through the public signup page.
          </p>
          <div className="admin-code-block">
            <code>cd ml-service</code>
            <code>python -m app.create_admin</code>
          </div>
          <p className="text-muted" style={{ marginTop: 8, fontSize: 12 }}>
            Set ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_USERNAME in ml-service/.env
          </p>
        </div>
        <div className="admin-settings-card danger-zone">
          <h4>Session</h4>
          <p className="text-muted">Sign out of the admin dashboard.</p>
          <button className="admin-danger-btn" onClick={onLogout}>
            <LogOut size={15} /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN ADMIN DASHBOARD SHELL
// ============================================================
const adminNav: { name: AdminPage; icon: React.ElementType }[] = [
  { name: 'Overview', icon: Activity },
  { name: 'Users', icon: Users },
  { name: 'Detections', icon: AudioLines },
  { name: 'Alerts', icon: Bell },
  { name: 'Reports', icon: BarChart2 },
  { name: 'Models', icon: Sparkles },
  { name: 'Logs', icon: Clock },
  { name: 'System', icon: Server },
  { name: 'Settings', icon: Settings },
];

export function AdminDashboard({
  user,
  onLogout,
}: {
  user: UserType;
  onLogout: () => void;
}) {
  const [page, setPage] = useState<AdminPage>('Overview');
  const [collapsed, setSidebarCollapsed] = useState(false);
  const [light, setLight] = useState(() => localStorage.getItem('ss:light') === 'on');

  const toggleLight = () => {
    setLight(v => {
      localStorage.setItem('ss:light', v ? 'off' : 'on');
      return !v;
    });
  };

  const renderPage = () => {
    switch (page) {
      case 'Overview': return <AdminOverview user={user} />;
      case 'Users': return <AdminUsers />;
      case 'Detections': return <AdminDetections />;
      case 'Alerts': return <AdminAlerts />;
      case 'Reports': return <AdminReports />;
      case 'Models': return <AdminModels />;
      case 'Logs': return <AdminLogs />;
      case 'System': return <AdminSystem />;
      case 'Settings': return <AdminSettings adminUser={user} onLogout={onLogout} />;
      default: return <AdminOverview user={user} />;
    }
  };

  return (
    <main className={`admin-shell ${light ? 'light' : ''} ${collapsed ? 'admin-collapsed' : ''}`}>
      {/* Admin Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <Logo />
          <span className="admin-badge">ADMIN</span>
        </div>

        <div className="admin-sidebar-user">
          <div className="admin-sidebar-avatar">{(user.name || 'A').slice(0, 2).toUpperCase()}</div>
          <div className="admin-sidebar-userinfo">
            <b>{user.name}</b>
            <span className="text-muted">{user.email}</span>
          </div>
        </div>

        <nav className="admin-nav">
          {adminNav.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`admin-nav-btn ${page === name ? 'active' : ''}`}
              onClick={() => setPage(name)}
            >
              <Icon size={17} />
              <span>{name}</span>
            </button>
          ))}
        </nav>

        <div className="admin-sidebar-foot">
          <button className="admin-signout-btn" onClick={onLogout}>
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Admin Main Content */}
      <div className="admin-main">
        {/* Top Bar */}
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <Shield size={18} className="text-cyan" />
            <span className="admin-topbar-title">Admin Dashboard</span>
            <span className="admin-topbar-sep">›</span>
            <span className="admin-topbar-page">{page}</span>
          </div>
          <div className="admin-topbar-right">
            <div className="admin-system-online">
              <span className="pulse-dot green" />
              System Online
            </div>
            <button className="admin-topbar-btn" onClick={toggleLight} title="Toggle theme">
              {light ? '☀️' : '🌙'}
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="admin-content-area">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              {renderPage()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
