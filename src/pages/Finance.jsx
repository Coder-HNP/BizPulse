import React, { useMemo } from 'react';
import { useFirestore } from '../hooks/useFirestore';
import { useOrganization } from '../contexts/OrganizationContext';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { DollarSign, TrendingUp, Activity, Wallet } from 'lucide-react';

export default function Finance() {
    const { data: sales, loading: salesLoading } = useFirestore('sales_orders');
    const { data: expenses, loading: expensesLoading } = useFirestore('expenses');
    const { data: inventory, loading: invLoading } = useFirestore('inventory_items');
    const { data: rawMaterials, loading: rmLoading } = useFirestore('raw_materials');
    const { data: receivables, loading: recLoading } = useFirestore('receivables');

    const loading = salesLoading || expensesLoading || invLoading || rmLoading || recLoading;

    const metrics = useMemo(() => {
        if (loading) return null;

        // 1. Profit & Loss
        const deliveredSales = sales.filter(s => s.status === 'delivered');
        const revenue = deliveredSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
        const cogs = deliveredSales.reduce((sum, s) => sum + (s.totalCost || 0), 0);
        const grossProfit = revenue - cogs;

        const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
        const netProfit = grossProfit - totalExpenses;
        const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

        // 2. Working Capital (Assets)
        const finishedGoodsValue = inventory.reduce((sum, i) => sum + ((i.quantity || 0) * (i.averageCost || 0)), 0);
        const rawMaterialsValue = rawMaterials.reduce((sum, m) => sum + ((m.quantity || 0) * (m.averageCost || 0)), 0);
        const receivablesValue = receivables.reduce((sum, r) => sum + (r.dueAmount || 0), 0);

        const totalInventoryValue = finishedGoodsValue + rawMaterialsValue;
        const currentAssets = totalInventoryValue + receivablesValue;

        // 3. Charts Data
        // Group by Month (simplified)
        const monthlyData = {};

        // Sales Revenue & COGS
        deliveredSales.forEach(s => {
            const date = new Date(s.deliveredAt?.toDate ? s.deliveredAt.toDate() : s.createdAt?.toDate ? s.createdAt.toDate() : new Date());
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyData[key]) monthlyData[key] = { name: key, revenue: 0, cogs: 0, expenses: 0, profit: 0 };
            monthlyData[key].revenue += (s.totalAmount || 0);
            monthlyData[key].cogs += (s.totalCost || 0);
        });

        // Expenses
        expenses.forEach(e => {
            const date = new Date(e.date);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyData[key]) monthlyData[key] = { name: key, revenue: 0, cogs: 0, expenses: 0, profit: 0 };
            monthlyData[key].expenses += (e.amount || 0);
        });

        // Calculate Profit per month
        const chartData = Object.values(monthlyData).sort((a, b) => a.name.localeCompare(b.name)).map(d => ({
            ...d,
            profit: d.revenue - d.cogs - d.expenses
        }));

        // Expense Categories
        const expenseCats = {};
        expenses.forEach(e => {
            const cat = e.category || 'Other';
            expenseCats[cat] = (expenseCats[cat] || 0) + e.amount;
        });
        const expensePieData = Object.entries(expenseCats).map(([name, value]) => ({ name, value }));

        return {
            revenue, cogs, grossProfit, totalExpenses, netProfit, profitMargin,
            finishedGoodsValue, rawMaterialsValue, receivablesValue, currentAssets,
            chartData, expensePieData
        };
    }, [sales, expenses, inventory, rawMaterials, receivables, loading]);

    if (loading) return <div className="p-10 text-center">Loading Financial Data...</div>;

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Financial Overview</h1>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
                <Card title="Revenue" value={metrics.revenue} icon={DollarSign} color="text-green-600" />
                <Card title="Net Profit" value={metrics.netProfit} icon={TrendingUp} color={metrics.netProfit >= 0 ? "text-green-600" : "text-red-600"} />
                <Card title="Profit Margin" value={`${metrics.profitMargin.toFixed(1)}%`} icon={Activity} color="text-indigo-600" isCurrency={false} />
                <Card title="Working Capital" value={metrics.currentAssets} icon={Wallet} color="text-blue-600" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* Revenue & Profit Chart */}
                <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Revenue vs Profit</h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={metrics.chartData}>
                                <defs>
                                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                                <Legend />
                                <Area type="monotone" dataKey="revenue" stroke="#82ca9d" fillOpacity={1} fill="url(#colorRev)" />
                                <Area type="monotone" dataKey="profit" stroke="#8884d8" fillOpacity={1} fill="url(#colorProfit)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Cost Breakdown Pie */}
                <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Operating Expenses Breakdown</h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={metrics.expensePieData}
                                    cx="50%" cy="50%"
                                    labelLine={false}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                    {metrics.expensePieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Detailed Metrics</h3>
                </div>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 p-6">
                    <MetricDetails label="Cost of Goods Sold (COGS)" value={metrics.cogs} />
                    <MetricDetails label="Operating Expenses" value={metrics.totalExpenses} />
                    <MetricDetails label="Gross Profit" value={metrics.grossProfit} />
                    <MetricDetails label="Raw Material Inventory" value={metrics.rawMaterialsValue} />
                    <MetricDetails label="Finished Goods Inventory" value={metrics.finishedGoodsValue} />
                    <MetricDetails label="Outstanding Receivables" value={metrics.receivablesValue} />
                </dl>
            </div>
        </div>
    );
}

function Card({ title, value, icon: Icon, color, isCurrency = true }) {
    return (
        <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
                <div className="flex items-center">
                    <div className="flex-shrink-0">
                        <Icon className={`h-6 w-6 ${color}`} aria-hidden="true" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                        <dl>
                            <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
                            <dd>
                                <div className="text-lg font-medium text-gray-900">
                                    {isCurrency && typeof value === 'number' ? `₹${value.toLocaleString()}` : value}
                                </div>
                            </dd>
                        </dl>
                    </div>
                </div>
            </div>
        </div>
    );
}

function MetricDetails({ label, value }) {
    return (
        <div className="sm:col-span-1">
            <dt className="text-sm font-medium text-gray-500">{label}</dt>
            <dd className="mt-1 text-sm text-gray-900 font-bold">₹{value.toLocaleString()}</dd>
        </div>
    );
}
