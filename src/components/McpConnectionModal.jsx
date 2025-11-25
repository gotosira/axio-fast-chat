import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Server, Terminal, Globe, RefreshCw } from 'lucide-react';

export const McpConnectionModal = ({ isOpen, onClose }) => {
    const [servers, setServers] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [newServer, setNewServer] = useState({
        name: '',
        type: 'stdio', // 'stdio' or 'sse'
        command: '',
        args: '',
        url: '',
        env: ''
    });

    useEffect(() => {
        if (isOpen) {
            fetchServers();
        }
    }, [isOpen]);

    const fetchServers = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/mcp/servers');
            if (response.ok) {
                const data = await response.json();
                setServers(data);
            }
        } catch (error) {
            console.error('Failed to fetch MCP servers:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleConnect = async () => {
        setIsLoading(true);
        try {
            const payload = {
                name: newServer.name,
                type: newServer.type,
            };

            if (newServer.type === 'stdio') {
                payload.command = newServer.command;
                payload.args = newServer.args.split(' ').filter(arg => arg.trim() !== '');
                // Parse env string "KEY=VALUE,KEY2=VALUE2"
                if (newServer.env) {
                    payload.env = newServer.env.split(',').reduce((acc, pair) => {
                        const [key, value] = pair.split('=');
                        if (key && value) acc[key.trim()] = value.trim();
                        return acc;
                    }, {});
                }
            } else {
                payload.url = newServer.url;
            }

            const response = await fetch('/api/mcp/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                setNewServer({ name: '', type: 'stdio', command: '', args: '', url: '', env: '' });
                fetchServers();
            } else {
                const err = await response.json();
                alert(`Connection failed: ${err.error}`);
            }
        } catch (error) {
            console.error('Connection error:', error);
            alert('Failed to connect to server');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDisconnect = async (id) => {
        if (!confirm('Are you sure you want to disconnect this server?')) return;

        try {
            const response = await fetch('/api/mcp/disconnect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            if (response.ok) {
                fetchServers();
            }
        } catch (error) {
            console.error('Disconnect error:', error);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-border-weak">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border-weak">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400">
                            <Server size={24} />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-text-primary">MCP Connections</h2>
                            <p className="text-xs text-text-muted">Manage Model Context Protocol servers</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-bg-hover rounded-full text-text-muted transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8">

                    {/* Active Connections */}
                    <section>
                        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
                            Active Servers
                            <span className="bg-bg-hover px-2 py-0.5 rounded-full text-xs text-text-primary">{servers.length}</span>
                        </h3>

                        {isLoading && servers.length === 0 ? (
                            <div className="flex items-center justify-center py-8 text-text-muted">
                                <RefreshCw className="animate-spin mr-2" size={16} /> Loading...
                            </div>
                        ) : servers.length === 0 ? (
                            <div className="text-center py-8 border-2 border-dashed border-border-weak rounded-xl bg-bg-subtle/30">
                                <p className="text-text-muted text-sm">No servers connected</p>
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                {servers.map(server => (
                                    <div key={server.id} className="flex items-center justify-between p-4 bg-bg-subtle rounded-xl border border-border-weak group hover:border-blue-200 dark:hover:border-blue-800 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-2 h-2 rounded-full ${server.status === 'connected' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-red-500'}`} />
                                            <div>
                                                <h4 className="font-medium text-text-primary">{server.name}</h4>
                                                <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                                                    <span className="uppercase bg-bg-hover px-1.5 rounded">{server.type}</span>
                                                    <span className="truncate max-w-[200px] font-mono opacity-75">
                                                        {server.type === 'stdio' ? server.command : server.url}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleDisconnect(server.id)}
                                            className="p-2 text-text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                            title="Disconnect"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Add New Connection */}
                    <section className="bg-bg-subtle/50 p-5 rounded-2xl border border-border-weak">
                        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
                            <Plus size={16} className="text-blue-500" />
                            Add New Connection
                        </h3>

                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-text-secondary">Server Name</label>
                                    <input
                                        type="text"
                                        value={newServer.name}
                                        onChange={e => setNewServer({ ...newServer, name: e.target.value })}
                                        placeholder="e.g., Local Filesystem"
                                        className="w-full px-3 py-2 bg-input-bg border border-input-border rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-text-secondary">Type</label>
                                    <div className="flex p-1 bg-input-bg border border-input-border rounded-lg">
                                        <button
                                            onClick={() => setNewServer({ ...newServer, type: 'stdio' })}
                                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${newServer.type === 'stdio' ? 'bg-white dark:bg-neutral-700 shadow-sm text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
                                        >
                                            <Terminal size={14} /> STDIO
                                        </button>
                                        <button
                                            onClick={() => setNewServer({ ...newServer, type: 'sse' })}
                                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${newServer.type === 'sse' ? 'bg-white dark:bg-neutral-700 shadow-sm text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
                                        >
                                            <Globe size={14} /> SSE
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {newServer.type === 'stdio' ? (
                                <>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="col-span-1 space-y-1.5">
                                            <label className="text-xs font-medium text-text-secondary">Command</label>
                                            <input
                                                type="text"
                                                value={newServer.command}
                                                onChange={e => setNewServer({ ...newServer, command: e.target.value })}
                                                placeholder="npx"
                                                className="w-full px-3 py-2 bg-input-bg border border-input-border rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono"
                                            />
                                        </div>
                                        <div className="col-span-2 space-y-1.5">
                                            <label className="text-xs font-medium text-text-secondary">Arguments</label>
                                            <input
                                                type="text"
                                                value={newServer.args}
                                                onChange={e => setNewServer({ ...newServer, args: e.target.value })}
                                                placeholder="-y @modelcontextprotocol/server-filesystem /path/to/dir"
                                                className="w-full px-3 py-2 bg-input-bg border border-input-border rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-text-secondary">Environment Variables (Optional)</label>
                                        <input
                                            type="text"
                                            value={newServer.env}
                                            onChange={e => setNewServer({ ...newServer, env: e.target.value })}
                                            placeholder="KEY=VALUE, API_KEY=12345"
                                            className="w-full px-3 py-2 bg-input-bg border border-input-border rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono"
                                        />
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-text-secondary">Server URL</label>
                                    <input
                                        type="text"
                                        value={newServer.url}
                                        onChange={e => setNewServer({ ...newServer, url: e.target.value })}
                                        placeholder="http://localhost:8000/sse"
                                        className="w-full px-3 py-2 bg-input-bg border border-input-border rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono"
                                    />
                                </div>
                            )}

                            <div className="pt-2 flex justify-end">
                                <button
                                    onClick={handleConnect}
                                    disabled={isLoading || !newServer.name || (newServer.type === 'stdio' ? !newServer.command : !newServer.url)}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {isLoading ? <RefreshCw className="animate-spin" size={16} /> : <Plus size={16} />}
                                    Connect Server
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};
