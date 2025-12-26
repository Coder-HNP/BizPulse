import React, { useState } from 'react';
import { useFirestore } from '../hooks/useFirestore';
import { useOrganization } from '../contexts/OrganizationContext';
import { db } from '../lib/firebase';
import { collection, addDoc, doc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '../components/common/Modal';

export default function Expenses() {
    const { data: expenses, loading, error } = useFirestore('expenses');
    const { organization } = useOrganization();

    const [isAddOpen, setIsAddOpen] = useState(false);
    const [newExpense, setNewExpense] = useState({
        description: '',
        amount: '',
        category: 'Operating',
        date: new Date().toISOString().split('T')[0]
    });

    const [actionLoading, setActionLoading] = useState(false);

    // Stats
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    async function handleAddExpense(e) {
        e.preventDefault();
        if (!organization || !newExpense.amount) return;

        setActionLoading(true);
        try {
            const expenseData = {
                ...newExpense,
                amount: parseFloat(newExpense.amount),
                orgId: organization.id,
                createdAt: serverTimestamp(),
                timestamp: new Date(newExpense.date).toISOString() // Normalized timestamp
            };

            await addDoc(collection(db, 'expenses'), expenseData);

            // Log Cash Outflow
            await addDoc(collection(db, 'cashflow_entries'), {
                orgId: organization.id,
                type: 'outflow',
                category: 'expense',
                amount: parseFloat(newExpense.amount),
                description: `Expense: ${newExpense.description} (${newExpense.category})`,
                timestamp: new Date(newExpense.date).toISOString()
            });

            setIsAddOpen(false);
            setNewExpense({ description: '', amount: '', category: 'Operating', date: new Date().toISOString().split('T')[0] });
        } catch (err) {
            console.error(err);
            alert("Failed to add expense");
        }
        setActionLoading(false);
    }

    async function handleDelete(id) {
        if (!window.confirm("Are you sure?")) return;
        try {
            await deleteDoc(doc(db, 'expenses', id));
        } catch (err) {
            console.error(err);
        }
    }

    if (loading) return <div className="p-4">Loading expenses...</div>;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-semibold text-gray-900">Operating Expenses</h1>
                <div className="flex items-center space-x-4">
                    <div className="bg-red-50 px-4 py-2 rounded-md">
                        <span className="text-red-700 font-medium">Total Expenses: </span>
                        <span className="text-red-900 font-bold">₹{totalExpenses.toLocaleString()}</span>
                    </div>
                    <button
                        onClick={() => setIsAddOpen(true)}
                        className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                    >
                        <Plus className="-ml-1 mr-2 h-5 w-5" />
                        Add Expense
                    </button>
                </div>
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-md">
                <ul className="divide-y divide-gray-200">
                    {expenses.map((expense) => (
                        <li key={expense.id} className="block hover:bg-gray-50">
                            <div className="px-4 py-4 sm:px-6">
                                <div className="flex items-center justify-between">
                                    <div className="truncate">
                                        <p className="text-sm font-medium text-indigo-600">{expense.description}</p>
                                        <p className="text-xs text-gray-400">{expense.category}</p>
                                    </div>
                                    <div className="ml-2 flex-shrink-0 flex items-center">
                                        <p className="px-2 inline-flex text-sm font-bold text-gray-900 mr-4">
                                            ₹{expense.amount?.toLocaleString()}
                                        </p>
                                        <p className="text-sm text-gray-500 mr-4">{new Date(expense.date).toLocaleDateString()}</p>
                                        <button onClick={() => handleDelete(expense.id)} className="text-red-400 hover:text-red-600">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </li>
                    ))}
                    {expenses.length === 0 && <li className="p-4 text-center text-gray-500">No expenses recorded</li>}
                </ul>
            </div>

            <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Record Expense">
                <form onSubmit={handleAddExpense}>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Description</label>
                            <input
                                type="text" required
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
                                value={newExpense.description}
                                onChange={e => setNewExpense({ ...newExpense, description: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Amount (₹)</label>
                            <input
                                type="number" step="0.01" required
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
                                value={newExpense.amount}
                                onChange={e => setNewExpense({ ...newExpense, amount: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Category</label>
                            <select
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
                                value={newExpense.category}
                                onChange={e => setNewExpense({ ...newExpense, category: e.target.value })}
                            >
                                <option value="Operating">Operating</option>
                                <option value="Labor">Labor</option>
                                <option value="Transport">Transport</option>
                                <option value="Maintenance">Maintenance</option>
                                <option value="Electricity">Electricity</option>
                                <option value="Marketing">Marketing</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Date</label>
                            <input
                                type="date" required
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
                                value={newExpense.date}
                                onChange={e => setNewExpense({ ...newExpense, date: e.target.value })}
                            />
                        </div>
                        <div className="mt-5 sm:mt-6">
                            <button
                                type="submit"
                                disabled={actionLoading}
                                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 sm:text-sm disabled:opacity-50"
                            >
                                {actionLoading ? 'Saving...' : 'Save Expense'}
                            </button>
                        </div>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
