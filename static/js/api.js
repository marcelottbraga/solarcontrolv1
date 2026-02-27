const API = {
    // --- AUTENTICAÇÃO ---
    login: async (usuario, senha) => {
        const resp = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario, senha })
        });
        return await resp.json();
    },

    logout: async (usuario) => {
        await fetch('/api/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario })
        });
    },

    // --- DADOS EM TEMPO REAL ---
    getDadosEstacao: async () => {
        try {
            const resp = await fetch('/api/dados');
            return await resp.json();
        } catch (e) { return { ok: false }; }
    },

    getStatusConexao: async () => {
        try {
            const resp = await fetch('/api/status');
            return await resp.json();
        } catch (e) { return { ok: false }; }
    },

    getStatusCameras: async () => {
        try {
            const resp = await fetch('/api/status/cameras');
            return await resp.json();
        } catch (e) { return {}; }
    },

    getTermostatos: async () => {
        try {
            const resp = await fetch('/api/termostatos');
            return await resp.json();
        } catch (e) { return { ok: false }; }
    },

    // --- COMANDOS E CONFIGURAÇÃO ---
    getConfig: async () => {
        try {
            const resp = await fetch('/api/config?t=' + new Date().getTime());
            return await resp.json();
        } catch (e) { return null; }
    },

    salvarConfig: async (dados) => {
        const resp = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        return await resp.json();
    },

    setSirene: async (ativo) => {
        try {
            await fetch('/api/alarme/sirene', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ativo })
            });
        } catch (e) {}
    },

    // --- USUÁRIOS (CRUD) ---
    getUsuarios: async () => {
        try {
            const resp = await fetch('/api/users');
            return await resp.json();
        } catch (e) { return []; }
    },
    
    criarUsuario: async (dados) => {
        const resp = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        return await resp.json();
    },
    
    editarUsuario: async (id, dados) => {
        const resp = await fetch(`/api/users/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        return await resp.json();
    },

    deletarUsuario: async (id, adminUser) => {
        const resp = await fetch(`/api/users/${id}?usuario=${encodeURIComponent(adminUser)}`, { method: 'DELETE' });
        return await resp.json();
    },

    // --- BASES HELIOTÉRMICAS (CRUD) ---
    getBases: async () => {
        try {
            const resp = await fetch('/api/bases');
            return await resp.json();
        } catch (e) { return []; }
    },

    criarBase: async (payload) => {
        const resp = await fetch('/api/bases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await resp.json();
    },

    atualizarBase: async (id, payload) => {
        const resp = await fetch(`/api/bases/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await resp.json();
    },

    deletarBase: async (id, usuario) => {
        const resp = await fetch(`/api/bases/${id}?usuario_solicitante=${encodeURIComponent(usuario)}`, { method: 'DELETE' });
        return await resp.json();
    },

    // --- RELATÓRIOS ---
    gerarRelatorioTela: async (payload) => {
        const res = await fetch('/api/relatorios/gerar', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        return await res.json();
    },

    baixarCSV: async (payload) => {
        return await fetch('/api/relatorios/exportar/csv', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
    },

    baixarPDF: async (payload) => {
        return await fetch('/api/relatorios/exportar/pdf', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
    },

    getAlarmesRecentes: async () => {
        const res = await fetch('/api/alarmes/recentes');
        return await res.json();
    }
};