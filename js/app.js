/**
 * GastroStock - Configuración y Lógica Consolidada
 */

// 1. CONFIGURACIÓN DATA API (Supabase / LocalStorage)
const SUPABASE_URL = ''; // URL de tu proyecto Supabase
const SUPABASE_KEY = ''; // Anon Key de tu proyecto Supabase

let supabaseClient = null;
if (SUPABASE_URL && SUPABASE_KEY && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase configurado correctamente.');
}

const DataAPI = {
    async getInventory() {
        try {
            if (supabaseClient) {
                const { data, error } = await supabaseClient.from('inventory').select('*');
                if (!error) return data;
            }
        } catch (e) { console.error(e); }
        return JSON.parse(localStorage.getItem('inventory') || '[]');
    },
    async saveItem(item) {
        try {
            if (supabaseClient) {
                const { error } = await supabaseClient.from('inventory').upsert(item);
                if (!error) return;
            }
        } catch (e) { console.error(e); }
        const items = await this.getInventory();
        const index = items.findIndex(i => i.id === item.id);
        if (index >= 0) items[index] = item;
        else items.push({ ...item, id: Date.now() });
        localStorage.setItem('inventory', JSON.stringify(items));
    },
    async getWaste() {
        return JSON.parse(localStorage.getItem('waste') || '[]');
    },
    async saveWaste(wasteItem) {
        const waste = await this.getWaste();
        waste.push(wasteItem);
        localStorage.setItem('waste', JSON.stringify(waste));
    },
    async getConsumos() {
        return JSON.parse(localStorage.getItem('consumos') || '[]');
    },
    async saveConsumo(consumo) {
        const consumos = await this.getConsumos();
        consumos.push(consumo);
        localStorage.setItem('consumos', JSON.stringify(consumos));
    }
};

// 2. LÓGICA DE INTERFAZ
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar Iconos
    lucide.createIcons();

    // Referencias al DOM
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.section');
    const sectionTitle = document.getElementById('section-title');
    const mainView = document.getElementById('main-view');

    let isRefreshing = false;

    // Navegación (Se maneja al final de app.js)

    // Helper para fechas locales (YYYY-MM-DD)
    const getLocalDateStr = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Lógica del Dashboard - Solo movimientos recientes
    const initDashboard = async () => {
        await updateRecentMovements();
    };

    // Calcular estado basado en fecha de vencimiento
    const getExpiryStatus = (expiryDate) => {
        if (!expiryDate) return { label: 'OK', class: 'ok', urgency: 'safe' };

        const today = new Date();
        const expiry = new Date(expiryDate);
        const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return { label: 'EXPIRADO', class: 'expired', urgency: 'urgent' };
        if (diffDays <= 7) return { label: 'VENCE PRONTO', class: 'warning', urgency: 'warning' };
        return { label: 'OK', class: 'ok', urgency: 'safe' };
    };

    // Movimientos Recientes
    const updateRecentMovements = async () => {
        const container = document.getElementById('recent-movements');
        if (!container) return;

        const items = await DataAPI.getInventory();
        const recent = items.slice(-5).reverse();

        if (recent.length === 0) {
            container.innerHTML = '<p class="placeholder-text">No hay movimientos recientes.</p>';
            return;
        }

        container.innerHTML = recent.map(item => `
            <div class="movement-item" style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,0.05);">
                <div>
                    <div style="font-weight: 600;">${item.name}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">Stock: ${item.stock} ${item.unit}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: 600; color: var(--primary);">${item.price * item.stock} €</div>
                </div>
            </div>
        `).join('');
    };

    // Lógica del Inventario
    const loadInventoryTable = async () => {
        const tbody = document.getElementById('inventory-table-body');
        if (!tbody) return;

        const items = await DataAPI.getInventory();

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">No hay productos en el inventario. Pulsa "Nuevo Registro" para empezar.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map(item => {
            const status = getExpiryStatus(item.expiry);
            return `
                <tr>
                    <td><strong>${item.name}</strong></td>
                    <td>${item.stock}</td>
                    <td>${item.unit}</td>
                    <td>${item.price} €</td>
                    <td>${item.expiry || '-'}</td>
                    <td><span class="status-badge ${status.class}">${status.label}</span></td>
                    <td>
                        <button class="btn-icon" title="Editar" onclick="editItem(${item.id})"><i data-lucide="edit-2"></i></button>
                        <button class="btn-icon" title="Registrar Desperdicio" onclick="registerWaste(${item.id})"><i data-lucide="trash"></i></button>
                        <button class="btn-icon delete" title="Eliminar" onclick="deleteItem(${item.id})"><i data-lucide="trash-2"></i></button>
                    </td>
                </tr>
            `;
        }).join('');
        lucide.createIcons();
    };

    // Tablero Kanban
    const loadKanbanBoard = async () => {
        const items = await DataAPI.getInventory();
        const cols = {
            urgent: document.getElementById('kanban-urgent'),
            warning: document.getElementById('kanban-warning'),
            safe: document.getElementById('kanban-safe')
        };

        if (!cols.urgent) return;

        // Limpiar columnas
        Object.values(cols).forEach(c => c.innerHTML = '');

        items.forEach(item => {
            const status = getExpiryStatus(item.expiry);
            const card = document.createElement('div');
            card.className = `kanban-card ${status.urgency}`;
            card.innerHTML = `
                <h4>${item.name}</h4>
                <p>Stock: ${item.stock} ${item.unit}</p>
                <div class="expiry-date">
                    <i data-lucide="calendar" style="width:14px"></i>
                    ${item.expiry || 'Sin fecha'}
                </div>
            `;
            cols[status.urgency].appendChild(card);
        });
        lucide.createIcons();
    };

    // Modals
    const modal = document.getElementById('modal-container');
    const openModalBtn = document.getElementById('add-stock-btn');
    const closeModalBtn = document.getElementById('close-modal');
    const cancelModalBtn = document.getElementById('cancel-btn');
    const stockForm = document.getElementById('stock-form');

    const toggleModal = (show = true) => {
        modal.classList.toggle('hidden', !show);
    };

    openModalBtn.addEventListener('click', () => {
        document.getElementById('modal-title').textContent = 'Añadir Producto';
        document.getElementById('item-id').value = '';
        stockForm.reset();
        toggleModal(true);
    });

    closeModalBtn.addEventListener('click', () => toggleModal(false));
    cancelModalBtn.addEventListener('click', () => toggleModal(false));

    window.editItem = async (id) => {
        const items = await DataAPI.getInventory();
        const item = items.find(i => i.id == id);
        if (!item) return;

        document.getElementById('modal-title').textContent = 'Editar Producto';
        document.getElementById('item-id').value = item.id;
        stockForm.name.value = item.name;
        stockForm.stock.value = item.stock;
        stockForm.unit.value = item.unit;
        stockForm.price.value = item.price;
        stockForm.expiry.value = item.expiry || '';

        toggleModal(true);
    };

    // Guardar Inventario
    stockForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(stockForm);
        const id = formData.get('id');
        const newItem = {
            name: formData.get('name'),
            stock: parseFloat(formData.get('stock')),
            unit: formData.get('unit'),
            price: parseFloat(formData.get('price')),
            expiry: formData.get('expiry')
        };
        if (id) newItem.id = parseInt(id);

        try {
            await DataAPI.saveItem(newItem);
            toggleModal(false);
            refreshAllData();
        } catch (err) {
            alert('Error al guardar: ' + err.message);
        }
    });

    // Actualizar Estadísticas del Dashboard
    const updateDashboardStats = async () => {
        const items = await DataAPI.getInventory();
        const waste = await DataAPI.getWaste();

        const total = items.reduce((acc, curr) => acc + (parseFloat(curr.stock) || 0), 0);
        const value = items.reduce((acc, curr) => acc + ((parseFloat(curr.stock) || 0) * (parseFloat(curr.price) || 0)), 0);
        const alerts = items.filter(i => (parseFloat(i.stock) || 0) < 5).length;

        // Calcular desperdicio mensual (MTD)
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const monthlyWasteValue = waste.reduce((acc, curr) => {
            const d = new Date(curr.date);
            if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
                return acc + (parseFloat(curr.cost) || 0);
            }
            return acc;
        }, 0);

        document.getElementById('total-stock').textContent = `${total.toFixed(1)} ud`;
        document.getElementById('stock-value').textContent = `${value.toFixed(2)} €`;
        document.getElementById('stock-alerts').textContent = alerts;
        document.getElementById('monthly-waste').textContent = `${monthlyWasteValue.toFixed(2)} €`;
    };

    // Lógica de Consumos
    const loadConsumosTable = async () => {
        const tbody = document.getElementById('consumos-table-body');
        const hbody = document.getElementById('consumos-history-body');
        if (!tbody) return;

        const items = await DataAPI.getInventory();
        const consumos = await DataAPI.getConsumos();

        // Tabla de acción
        tbody.innerHTML = items.map(item => `
            <tr>
                <td><strong>${item.name}</strong></td>
                <td>${item.stock} ${item.unit}</td>
                <td>
                    <button class="btn btn-primary" style="padding: 4px 12px; font-size: 0.8rem;" onclick="registerConsumption(${item.id})">
                        Registrar Gasto
                    </button>
                </td>
            </tr>
        `).join('');

        // Tabla de historial
        hbody.innerHTML = consumos.slice(-10).reverse().map(c => `
            <tr>
                <td>${new Date(c.date).toLocaleDateString()}</td>
                <td><strong>${c.name}</strong></td>
                <td>${c.amount} ${c.unit}</td>
                <td>${c.cost.toFixed(2)} €</td>
            </tr>
        `).join('');
    };

    window.registerConsumption = async (itemId) => {
        const items = await DataAPI.getInventory();
        const item = items.find(i => i.id == itemId);
        if (!item) return;

        const amount = prompt(`¿Cuánto has consumido de "${item.name}" hoy?`, '0');
        if (amount && !isNaN(amount) && parseFloat(amount) > 0) {
            const consumoAmount = parseFloat(amount);

            if (consumoAmount > item.stock) {
                alert('No puedes consumir más de lo que hay en stock.');
                return;
            }

            const consumoItem = {
                productId: item.id,
                name: item.name,
                unit: item.unit,
                amount: consumoAmount,
                cost: consumoAmount * item.price,
                date: new Date().toISOString()
            };

            // 1. Guardar consumo mediante API
            await DataAPI.saveConsumo(consumoItem);

            // 2. Reducir stock real
            item.stock -= consumoAmount;
            await DataAPI.saveItem(item);

            alert('Consumo registrado y stock actualizado.');
            refreshAllData();
        }
    };

    // Lógica de Aprovisionamiento
    const loadProvisioningTable = async () => {
        const tbody = document.getElementById('provisioning-table-body');
        const items = await DataAPI.getInventory();
        const lowStockItems = items.filter(i => i.stock < 5);

        if (lowStockItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">No hay sugerencias de pedido. ¡Buen trabajo!</td></tr>';
            return;
        }

        tbody.innerHTML = lowStockItems.map(item => `
            <tr>
                <td><strong>${item.name}</strong></td>
                <td><span class="status-badge low">${item.stock} ${item.unit}</span></td>
                <td>Proveedor local</td>
                <td>
                    <button class="btn btn-primary" style="padding: 4px 12px; font-size: 0.8rem;" onclick="alert('Pedido enviado a proveedor')">
                        Pedir más
                    </button>
                </td>
            </tr>
        `).join('');
    };

    // Registro de Desperdicio (CON REDUCCIÓN DE STOCK)
    window.registerWaste = async (itemId) => {
        const items = await DataAPI.getInventory();
        const item = items.find(i => i.id == itemId);
        if (!item) return;

        const amount = prompt(`¿Cuánto de "${item.name}" se ha desperdiciado? (Stock actual: ${item.stock} ${item.unit})`, '0');
        if (amount && !isNaN(amount) && parseFloat(amount) > 0) {
            const wasteAmount = parseFloat(amount);

            if (wasteAmount > item.stock) {
                alert('No puedes desperdiciar más de lo que hay en stock.');
                return;
            }

            const wasteItem = {
                productId: item.id,
                name: item.name,
                amount: wasteAmount,
                cost: wasteAmount * item.price,
                date: new Date().toISOString()
            };

            // 1. Guardar desperdicio mediante API estandarizada
            await DataAPI.saveWaste(wasteItem);

            // 2. Reducir stock real
            item.stock -= wasteAmount;
            await DataAPI.saveItem(item);

            alert('Desperdicio registrado y stock actualizado.');
            refreshAllData();
        }
    };

    // Acción eliminar
    window.deleteItem = async (id) => {
        if (confirm('¿Estás seguro de que quieres eliminar este producto?')) {
            if (!supabaseClient) {
                const items = JSON.parse(localStorage.getItem('inventory') || '[]');
                const filtered = items.filter(i => i.id !== id);
                localStorage.setItem('inventory', JSON.stringify(filtered));
            } else {
                await supabaseClient.from('inventory').delete().eq('id', id);
            }
            refreshAllData();
        }
    };

    // Función para el módulo de análisis
    window.renderAnalysisCharts = async () => {
        const waste = await DataAPI.getWaste();
        const totalWaste = waste.reduce((acc, curr) => acc + curr.cost, 0);

        document.getElementById('total-waste-annual').textContent = `${totalWaste.toFixed(2)} €`;

        const ctx = document.getElementById('wasteAnalysisChart')?.getContext('2d');
        if (!ctx) return;

        if (window.myWasteChart instanceof Chart) window.myWasteChart.destroy();

        window.myWasteChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: waste.length > 0 ? waste.map(w => w.name).slice(-5) : ['Sin datos'],
                datasets: [{
                    data: waste.length > 0 ? waste.map(w => w.cost).slice(-5) : [1],
                    backgroundColor: waste.length > 0
                        ? ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899']
                        : ['#e2e8f0']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Origen del Desperdicio (€)' },
                    legend: { position: 'bottom' }
                }
            }
        });
    };

    // Navegación (Actualizada para incluir provisioning)
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.getAttribute('data-section');
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            sections.forEach(s => s.classList.remove('active'));
            document.getElementById(`${target}-section`).classList.add('active');
            sectionTitle.textContent = item.textContent.trim();

            if (target === 'dashboard') initDashboard();
            if (target === 'analysis') renderAnalysisCharts();
            if (target === 'inventory') loadInventoryTable();
            if (target === 'provisioning') loadProvisioningTable();
            if (target === 'kanban') loadKanbanBoard();
            if (target === 'consumos') loadConsumosTable();
        });
    });

    // Refrescar todos los datos (CON BLOQUEO DE CONCURRENCIA)
    const refreshAllData = async () => {
        if (isRefreshing) return;
        isRefreshing = true;

        try {
            await initDashboard();
            await updateDashboardStats();
            await loadInventoryTable();
            await loadProvisioningTable();
            await loadKanbanBoard();
            await loadConsumosTable();
        } catch (err) {
            console.error('Error en refresco global:', err);
        } finally {
            isRefreshing = false;
        }
    };

    // Lanzar carga inicial
    refreshAllData();
});
